// Package httpapi exposes the JSON API and maps HTTP concerns once.
package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/xuanlight/floating-bottle/backend/internal/auth"
	"github.com/xuanlight/floating-bottle/backend/internal/domain"
	"github.com/xuanlight/floating-bottle/backend/internal/service"
)

type HealthChecker interface {
	Ping(context.Context) error
}

type Server struct {
	app    *service.App
	health HealthChecker
	log    *slog.Logger
}

func NewRouter(app *service.App, health HealthChecker, authn *auth.Middleware, log *slog.Logger, origins []string) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	s := &Server{app: app, health: health, log: log}
	r.Use(requestID(), cors(origins), accessLog(log), gin.CustomRecovery(func(c *gin.Context, recovered any) {
		log.Error("panic recovered", "request_id", c.GetString("request_id"), "error", recovered)
		writeError(c, errors.New("panic recovered"))
	}))
	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	r.GET("/readyz", s.ready)

	v1 := r.Group("/api/v1")
	v1.Use(errorBoundary(log), authn.Handler())
	v1.GET("/experiences", s.listExperiences)
	v1.POST("/experiences", s.createExperience)
	v1.PATCH("/experiences/:experienceId", s.updateExperience)
	v1.DELETE("/experiences/:experienceId", s.deleteExperience)
	v1.POST("/bottles", s.createBottle)
	v1.GET("/bottles/:bottleId", s.getBottle)
	v1.PATCH("/bottles/:bottleId", s.updateBottle)
	v1.POST("/bottles/:bottleId/launch", s.launchBottle)
	return r
}

func (s *Server) ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()
	if err := s.health.Ping(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

func (s *Server) listExperiences(c *gin.Context) {
	items, err := s.app.ListExperiences(c.Request.Context(), auth.UserID(c))
	if err != nil {
		c.Error(err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items, "nextCursor": nil})
}

type experienceRequest struct {
	Title           string            `json:"title"`
	Body            string            `json:"body"`
	ConfirmedByUser bool              `json:"confirmedByUser"`
	ReceiveOpen     bool              `json:"receiveOpen"`
	Disclosure      domain.Disclosure `json:"disclosure"`
}

func (s *Server) createExperience(c *gin.Context) {
	var req experienceRequest
	if err := decodeJSON(c, &req); err != nil {
		c.Error(err)
		return
	}
	item, err := s.app.CreateExperience(c.Request.Context(), auth.UserID(c), service.CreateExperienceInput{
		Title: req.Title, Body: req.Body, ConfirmedByUser: req.ConfirmedByUser,
		ReceiveOpen: req.ReceiveOpen, Disclosure: req.Disclosure,
	})
	if err != nil {
		c.Error(err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": item})
}

type experiencePatchRequest struct {
	Title           *string            `json:"title"`
	Body            *string            `json:"body"`
	ConfirmedByUser *bool              `json:"confirmedByUser"`
	ReceiveOpen     *bool              `json:"receiveOpen"`
	Disclosure      *domain.Disclosure `json:"disclosure"`
}

func (s *Server) updateExperience(c *gin.Context) {
	var req experiencePatchRequest
	if err := decodeJSON(c, &req); err != nil {
		c.Error(err)
		return
	}
	item, err := s.app.UpdateExperience(c.Request.Context(), auth.UserID(c), c.Param("experienceId"), domain.ExperiencePatch{
		Title: req.Title, Body: req.Body, ConfirmedByUser: req.ConfirmedByUser,
		ReceiveOpen: req.ReceiveOpen, Disclosure: req.Disclosure,
	})
	if err != nil {
		c.Error(err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

func (s *Server) deleteExperience(c *gin.Context) {
	if err := s.app.DeleteExperience(c.Request.Context(), auth.UserID(c), c.Param("experienceId")); err != nil {
		c.Error(err)
		return
	}
	c.Status(http.StatusNoContent)
}

type createBottleRequest struct {
	EpisodeText string `json:"episodeText"`
	TargetHint  string `json:"targetHint"`
}

func (s *Server) createBottle(c *gin.Context) {
	var req createBottleRequest
	if err := decodeJSON(c, &req); err != nil {
		c.Error(err)
		return
	}
	item, err := s.app.CreateBottle(c.Request.Context(), auth.UserID(c), service.CreateBottleInput{
		EpisodeText: req.EpisodeText, TargetHint: req.TargetHint,
	})
	if err != nil {
		c.Error(err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": domain.ViewBottle(item)})
}

func (s *Server) getBottle(c *gin.Context) {
	item, err := s.app.GetBottle(c.Request.Context(), auth.UserID(c), c.Param("bottleId"))
	if err != nil {
		c.Error(err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"bottle": domain.ViewBottle(item), "connections": []any{}}})
}

type bottlePatchRequest struct {
	SourceContentVersion *uint   `json:"sourceContentVersion"`
	EpisodeText          *string `json:"episodeText"`
	TargetHint           *string `json:"targetHint"`
	Episode              *struct {
		Title     *string `json:"title"`
		Confirmed *bool   `json:"confirmed"`
	} `json:"episode"`
	Target *domain.TargetRules `json:"target"`
}

func (s *Server) updateBottle(c *gin.Context) {
	var req bottlePatchRequest
	if err := decodeJSON(c, &req); err != nil {
		c.Error(err)
		return
	}
	patch := domain.BottlePatch{
		EpisodeRaw: req.EpisodeText, TargetHint: req.TargetHint, Target: req.Target,
		SourceVersion: req.SourceContentVersion,
	}
	if req.Episode != nil {
		patch.EpisodeTitle = req.Episode.Title
		patch.EpisodeConfirmed = req.Episode.Confirmed
	}
	item, err := s.app.UpdateBottle(c.Request.Context(), auth.UserID(c), c.Param("bottleId"), patch)
	if err != nil {
		c.Error(err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": domain.ViewBottle(item)})
}

func (s *Server) launchBottle(c *gin.Context) {
	result, err := s.app.LaunchBottle(c.Request.Context(), auth.UserID(c), c.Param("bottleId"))
	if err != nil {
		c.Error(err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"data": result})
}

func decodeJSON(c *gin.Context, target any) error {
	decoder := json.NewDecoder(io.LimitReader(c.Request.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return domain.NewProblem("INVALID_JSON", "请求内容不是有效的 JSON", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return domain.NewProblem("INVALID_JSON", "请求只能包含一个 JSON 对象", err)
	}
	return nil
}

func errorBoundary(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		if len(c.Errors) == 0 || c.Writer.Written() {
			return
		}
		err := c.Errors.Last().Err
		if _, ok := err.(*domain.Problem); !ok && !errors.Is(err, domain.ErrNotFound) && !errors.Is(err, domain.ErrConflict) {
			log.Error("request failed", "request_id", c.GetString("request_id"), "error", err)
		}
		writeError(c, err)
	}
}

func writeError(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	code, message := "INTERNAL_ERROR", "服务暂时不可用"
	var details map[string]any
	var problem *domain.Problem
	if errors.As(err, &problem) {
		code, message, details = problem.Code, problem.Message, problem.Details
		if errors.Is(problem, domain.ErrConflict) {
			status = http.StatusConflict
		} else {
			status = http.StatusBadRequest
		}
	} else if errors.Is(err, domain.ErrNotFound) {
		status, code, message = http.StatusNotFound, "NOT_FOUND", "资源不存在"
	} else if errors.Is(err, domain.ErrConflict) {
		status, code, message = http.StatusConflict, "CONFLICT", "当前状态不允许该操作"
	}
	payload := gin.H{"code": code, "message": message}
	if details != nil {
		payload["details"] = details
	}
	c.JSON(status, gin.H{"error": payload})
}

func requestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := strings.TrimSpace(c.GetHeader("X-Request-ID"))
		if id == "" || len(id) > 128 {
			var value [12]byte
			if _, err := rand.Read(value[:]); err == nil {
				id = hex.EncodeToString(value[:])
			} else {
				id = "unavailable"
			}
		}
		c.Set("request_id", id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

func accessLog(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Info("http request", "request_id", c.GetString("request_id"), "method", c.Request.Method,
			"path", c.Request.URL.Path, "status", c.Writer.Status(), "duration_ms", time.Since(start).Milliseconds())
	}
}

func cors(origins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		allowed[origin] = struct{}{}
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if _, ok := allowed[origin]; ok {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
