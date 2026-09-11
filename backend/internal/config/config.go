// Package config loads process configuration once at startup.
package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Environment     string
	HTTPAddress     string
	MySQLDSN        string
	AllowedOrigins  []string
	DemoAuthEnabled bool
	ShutdownTimeout time.Duration
	DatabaseTimeout time.Duration
}

func Load() (Config, error) {
	if err := loadDotEnv(".env"); err != nil && !errors.Is(err, os.ErrNotExist) {
		return Config{}, fmt.Errorf("load .env: %w", err)
	}

	cfg := Config{
		Environment:     env("APP_ENV", "development"),
		HTTPAddress:     env("HTTP_ADDR", ":8080"),
		MySQLDSN:        strings.TrimSpace(os.Getenv("MYSQL_DSN")),
		AllowedOrigins:  splitCSV(env("CORS_ALLOWED_ORIGINS", "http://localhost:5173")),
		ShutdownTimeout: 10 * time.Second,
		DatabaseTimeout: 5 * time.Second,
	}

	var err error
	cfg.DemoAuthEnabled, err = strconv.ParseBool(env("DEMO_AUTH_ENABLED", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("DEMO_AUTH_ENABLED must be true or false")
	}
	if cfg.MySQLDSN == "" {
		return Config{}, fmt.Errorf("MYSQL_DSN is required")
	}
	if cfg.Environment == "production" && cfg.DemoAuthEnabled {
		return Config{}, fmt.Errorf("DEMO_AUTH_ENABLED cannot be true in production")
	}
	if len(cfg.AllowedOrigins) == 0 {
		return Config{}, fmt.Errorf("CORS_ALLOWED_ORIGINS must contain at least one origin")
	}
	return cfg, nil
}

// loadDotEnv supports the simple KEY=VALUE format produced by setup_db.py.
// Existing process environment always wins.
func loadDotEnv(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			return fmt.Errorf("invalid line for %q", line)
		}
		key = strings.TrimSpace(key)
		if key == "" {
			return fmt.Errorf("empty environment key")
		}
		if _, exists := os.LookupEnv(key); !exists {
			if err := os.Setenv(key, strings.TrimSpace(value)); err != nil {
				return err
			}
		}
	}
	return scanner.Err()
}

func env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func splitCSV(value string) []string {
	var result []string
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			result = append(result, item)
		}
	}
	return result
}
