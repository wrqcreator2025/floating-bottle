package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/xuanlight/floating-bottle/backend/internal/auth"
	"github.com/xuanlight/floating-bottle/backend/internal/config"
	"github.com/xuanlight/floating-bottle/backend/internal/httpapi"
	mysqlrepo "github.com/xuanlight/floating-bottle/backend/internal/repository/mysql"
	"github.com/xuanlight/floating-bottle/backend/internal/service"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		log.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	db, err := mysqlrepo.Open(cfg.MySQLDSN)
	if err != nil {
		log.Error("database open failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), cfg.DatabaseTimeout)
	err = db.PingContext(ctx)
	cancel()
	if err != nil {
		log.Error("database unavailable", "error", err)
		os.Exit(1)
	}

	repo := mysqlrepo.New(db)
	app := service.New(repo)
	authn := auth.NewMiddleware(repo, cfg.DemoAuthEnabled)
	router := httpapi.NewRouter(app, repo, authn, log, cfg.AllowedOrigins)
	server := &http.Server{
		Addr: cfg.HTTPAddress, Handler: router,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		log.Info("api listening", "address", cfg.HTTPAddress, "environment", cfg.Environment)
		serverErrors <- server.ListenAndServe()
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	select {
	case sig := <-signals:
		log.Info("shutdown requested", "signal", sig.String())
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Error("http server stopped", "error", err)
		}
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer shutdownCancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Error("graceful shutdown failed", "error", err)
	}
}
