// Package service owns validation, authorization inputs and business use cases.
package service

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/xuanlight/floating-bottle/backend/internal/domain"
)

type CoreRepository interface {
	ListExperiences(context.Context, string) ([]domain.Experience, error)
	GetExperience(context.Context, string, string) (domain.Experience, error)
	CreateExperience(context.Context, string, domain.Experience) (domain.Experience, error)
	UpdateExperience(context.Context, string, string, domain.ExperiencePatch) (domain.Experience, error)
	DeleteExperience(context.Context, string, string) error
	CreateBottle(context.Context, string, string, string) (domain.Bottle, error)
	GetBottle(context.Context, string, string) (domain.Bottle, error)
	UpdateBottle(context.Context, string, string, domain.BottlePatch) (domain.Bottle, error)
	LaunchBottle(context.Context, string, string) (domain.LaunchResult, error)
}

type App struct {
	repo CoreRepository
}

func New(repo CoreRepository) *App { return &App{repo: repo} }

type CreateExperienceInput struct {
	Title           string
	Body            string
	ConfirmedByUser bool
	ReceiveOpen     bool
	Disclosure      domain.Disclosure
}

func (a *App) ListExperiences(ctx context.Context, userID string) ([]domain.Experience, error) {
	return a.repo.ListExperiences(ctx, userID)
}

func (a *App) CreateExperience(ctx context.Context, userID string, in CreateExperienceInput) (domain.Experience, error) {
	in.Title = strings.TrimSpace(in.Title)
	in.Body = strings.TrimSpace(in.Body)
	if err := requiredText("title", in.Title, 80); err != nil {
		return domain.Experience{}, err
	}
	if err := requiredText("body", in.Body, 8000); err != nil {
		return domain.Experience{}, err
	}
	if !in.ConfirmedByUser {
		return domain.Experience{}, domain.NewProblem("EXPERIENCE_CONFIRMATION_REQUIRED", "请先确认这是本人真实经历", nil)
	}
	return a.repo.CreateExperience(ctx, userID, domain.Experience{
		Title: in.Title, Body: in.Body, ConfirmedByUser: true,
		ReceiveOpen: in.ReceiveOpen, Disclosure: in.Disclosure, Source: "manual",
	})
}

func (a *App) UpdateExperience(ctx context.Context, userID, id string, patch domain.ExperiencePatch) (domain.Experience, error) {
	current, err := a.repo.GetExperience(ctx, userID, id)
	if err != nil {
		return domain.Experience{}, err
	}
	if patch.Title != nil {
		value := strings.TrimSpace(*patch.Title)
		if err := requiredText("title", value, 80); err != nil {
			return domain.Experience{}, err
		}
		patch.Title = &value
	}
	if patch.Body != nil {
		value := strings.TrimSpace(*patch.Body)
		if err := requiredText("body", value, 8000); err != nil {
			return domain.Experience{}, err
		}
		patch.Body = &value
	}
	confirmed := current.ConfirmedByUser
	open := current.ReceiveOpen
	if patch.ConfirmedByUser != nil {
		confirmed = *patch.ConfirmedByUser
	}
	if patch.ReceiveOpen != nil {
		open = *patch.ReceiveOpen
	}
	if open && !confirmed {
		return domain.Experience{}, domain.NewProblem("EXPERIENCE_CONFIRMATION_REQUIRED", "开启接收前必须确认这是本人经历", domain.ErrConflict)
	}
	return a.repo.UpdateExperience(ctx, userID, id, patch)
}

func (a *App) DeleteExperience(ctx context.Context, userID, id string) error {
	return a.repo.DeleteExperience(ctx, userID, id)
}

type CreateBottleInput struct {
	EpisodeText string
	TargetHint  string
}

func (a *App) CreateBottle(ctx context.Context, userID string, in CreateBottleInput) (domain.Bottle, error) {
	in.EpisodeText = strings.TrimSpace(in.EpisodeText)
	in.TargetHint = strings.TrimSpace(in.TargetHint)
	if err := requiredText("episodeText", in.EpisodeText, 4000); err != nil {
		return domain.Bottle{}, err
	}
	if in.TargetHint != "" && utf8.RuneCountInString(in.TargetHint) > 4000 {
		return domain.Bottle{}, invalidField("targetHint", "目标提示不能超过 4000 个字符")
	}
	return a.repo.CreateBottle(ctx, userID, in.EpisodeText, in.TargetHint)
}

func (a *App) GetBottle(ctx context.Context, userID, id string) (domain.Bottle, error) {
	return a.repo.GetBottle(ctx, userID, id)
}

func (a *App) UpdateBottle(ctx context.Context, userID, id string, patch domain.BottlePatch) (domain.Bottle, error) {
	if patch.EpisodeRaw != nil {
		value := strings.TrimSpace(*patch.EpisodeRaw)
		if err := requiredText("episodeText", value, 4000); err != nil {
			return domain.Bottle{}, err
		}
		patch.EpisodeRaw = &value
	}
	if patch.EpisodeTitle != nil {
		value := strings.TrimSpace(*patch.EpisodeTitle)
		if value != "" && utf8.RuneCountInString(value) > 255 {
			return domain.Bottle{}, invalidField("episode.title", "标题不能超过 255 个字符")
		}
		patch.EpisodeTitle = &value
	}
	if patch.TargetHint != nil {
		value := strings.TrimSpace(*patch.TargetHint)
		if value != "" && utf8.RuneCountInString(value) > 4000 {
			return domain.Bottle{}, invalidField("targetHint", "目标提示不能超过 4000 个字符")
		}
		patch.TargetHint = &value
	}
	if patch.Target != nil {
		cleanRules(patch.Target)
		if err := validateRules(*patch.Target); err != nil {
			return domain.Bottle{}, err
		}
	}
	return a.repo.UpdateBottle(ctx, userID, id, patch)
}

func (a *App) LaunchBottle(ctx context.Context, userID, id string) (domain.LaunchResult, error) {
	bottle, err := a.repo.GetBottle(ctx, userID, id)
	if err != nil {
		return domain.LaunchResult{}, err
	}
	if bottle.Status == "searching" {
		return domain.LaunchResult{BottleID: id, Status: "searching", Interaction: "throw_to_sea"}, nil
	}
	if bottle.Status != "draft" {
		return domain.LaunchResult{}, domain.NewProblem("INVALID_BOTTLE_STATE", "当前瓶子状态不能抛出", domain.ErrConflict)
	}
	if !bottle.EpisodeConfirmed {
		return domain.LaunchResult{}, domain.NewProblem("EPISODE_CONFIRMATION_REQUIRED", "请先确认整理后的处境", domain.ErrConflict)
	}
	if len(bottle.Target.RequiredExperiences) == 0 {
		return domain.LaunchResult{}, domain.NewProblem("TARGET_CONFIRMATION_REQUIRED", "请先确认希望找到的经历", domain.ErrConflict)
	}
	return a.repo.LaunchBottle(ctx, userID, id)
}

func requiredText(field, value string, max int) error {
	if value == "" {
		return invalidField(field, "该字段不能为空")
	}
	if utf8.RuneCountInString(value) > max {
		return invalidField(field, "内容超过长度限制")
	}
	return nil
}

func invalidField(field, message string) *domain.Problem {
	p := domain.NewProblem("INVALID_ARGUMENT", message, nil)
	p.Details = map[string]any{"field": field}
	return p
}

func cleanRules(rules *domain.TargetRules) {
	rules.RequiredExperiences = cleanStrings(rules.RequiredExperiences)
	rules.PreferredExperiences = cleanStrings(rules.PreferredExperiences)
	rules.ViewpointPreferences = cleanStrings(rules.ViewpointPreferences)
}

func cleanStrings(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			result = append(result, value)
		}
	}
	return result
}

func validateRules(rules domain.TargetRules) error {
	for _, group := range [][]string{rules.RequiredExperiences, rules.PreferredExperiences, rules.ViewpointPreferences} {
		if len(group) > 20 {
			return invalidField("target", "每类匹配条件最多 20 项")
		}
		for _, item := range group {
			if utf8.RuneCountInString(item) > 500 {
				return invalidField("target", "单条匹配条件不能超过 500 个字符")
			}
		}
	}
	return nil
}
