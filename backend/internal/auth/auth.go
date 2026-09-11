// Package auth resolves the trusted application user for each request.
package auth

import (
	"context"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

const userIDKey = "authenticated_user_id"

var demoSubjectPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

type UserResolver interface {
	EnsureUser(context.Context, string) (string, error)
}

type Middleware struct {
	resolver    UserResolver
	demoEnabled bool
}

func NewMiddleware(resolver UserResolver, demoEnabled bool) *Middleware {
	return &Middleware{resolver: resolver, demoEnabled: demoEnabled}
}

func (m *Middleware) Handler() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearer(c.GetHeader("Authorization"))
		if token == "" {
			abort(c, "AUTH_REQUIRED", "请先登录")
			return
		}
		if !m.demoEnabled || !strings.HasPrefix(token, "demo.") {
			abort(c, "INVALID_TOKEN", "登录凭据无效")
			return
		}
		subject := strings.TrimPrefix(token, "demo.")
		if !demoSubjectPattern.MatchString(subject) {
			abort(c, "INVALID_TOKEN", "登录凭据无效")
			return
		}
		userID, err := m.resolver.EnsureUser(c.Request.Context(), "demo:"+subject)
		if err != nil {
			c.Error(err)
			c.Abort()
			return
		}
		c.Set(userIDKey, userID)
		c.Next()
	}
}

func UserID(c *gin.Context) string {
	value, _ := c.Get(userIDKey)
	userID, _ := value.(string)
	return userID
}

func bearer(header string) string {
	scheme, token, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return strings.TrimSpace(token)
}

func abort(c *gin.Context, code, message string) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": code, "message": message}})
}
