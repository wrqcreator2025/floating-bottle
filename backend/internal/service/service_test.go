package service

import (
	"context"
	"errors"
	"testing"

	"github.com/xuanlight/floating-bottle/backend/internal/domain"
)

type fakeRepository struct {
	experience domain.Experience
	bottle     domain.Bottle
	launched   bool
}

func (f *fakeRepository) ListExperiences(context.Context, string) ([]domain.Experience, error) {
	return []domain.Experience{f.experience}, nil
}
func (f *fakeRepository) GetExperience(context.Context, string, string) (domain.Experience, error) {
	if f.experience.ID == "" {
		return domain.Experience{}, domain.ErrNotFound
	}
	return f.experience, nil
}
func (f *fakeRepository) CreateExperience(_ context.Context, _ string, item domain.Experience) (domain.Experience, error) {
	item.ID = "experience"
	f.experience = item
	return item, nil
}
func (f *fakeRepository) UpdateExperience(_ context.Context, _, _ string, patch domain.ExperiencePatch) (domain.Experience, error) {
	if patch.ReceiveOpen != nil {
		f.experience.ReceiveOpen = *patch.ReceiveOpen
	}
	return f.experience, nil
}
func (f *fakeRepository) DeleteExperience(context.Context, string, string) error { return nil }
func (f *fakeRepository) CreateBottle(_ context.Context, _ string, episode, hint string) (domain.Bottle, error) {
	f.bottle = domain.Bottle{ID: "bottle", EpisodeRaw: episode, TargetHint: hint, Status: "draft", ContentVersion: 1}
	return f.bottle, nil
}
func (f *fakeRepository) GetBottle(context.Context, string, string) (domain.Bottle, error) {
	if f.bottle.ID == "" {
		return domain.Bottle{}, domain.ErrNotFound
	}
	return f.bottle, nil
}
func (f *fakeRepository) UpdateBottle(context.Context, string, string, domain.BottlePatch) (domain.Bottle, error) {
	return f.bottle, nil
}
func (f *fakeRepository) LaunchBottle(context.Context, string, string) (domain.LaunchResult, error) {
	f.launched = true
	return domain.LaunchResult{BottleID: f.bottle.ID, Status: "searching"}, nil
}

func TestExperienceRequiresUserConfirmation(t *testing.T) {
	app := New(&fakeRepository{})
	_, err := app.CreateExperience(context.Background(), "user", CreateExperienceInput{Title: "经历", Body: "内容"})
	var problem *domain.Problem
	if !errors.As(err, &problem) || problem.Code != "EXPERIENCE_CONFIRMATION_REQUIRED" {
		t.Fatalf("expected confirmation problem, got %v", err)
	}
}

func TestOpenExperienceCannotBecomeUnconfirmed(t *testing.T) {
	repo := &fakeRepository{experience: domain.Experience{ID: "experience", ConfirmedByUser: true, ReceiveOpen: true}}
	app := New(repo)
	confirmed := false
	_, err := app.UpdateExperience(context.Background(), "user", "experience", domain.ExperiencePatch{ConfirmedByUser: &confirmed})
	var problem *domain.Problem
	if !errors.As(err, &problem) || problem.Code != "EXPERIENCE_CONFIRMATION_REQUIRED" {
		t.Fatalf("expected confirmation problem, got %v", err)
	}
}

func TestCreateBottleTrimsInput(t *testing.T) {
	repo := &fakeRepository{}
	app := New(repo)
	item, err := app.CreateBottle(context.Background(), "user", CreateBottleInput{EpisodeText: "  第一次找实习  "})
	if err != nil {
		t.Fatal(err)
	}
	if item.EpisodeRaw != "第一次找实习" {
		t.Fatalf("unexpected episode: %q", item.EpisodeRaw)
	}
}

func TestLaunchRequiresConfirmedTarget(t *testing.T) {
	repo := &fakeRepository{bottle: domain.Bottle{ID: "bottle", Status: "draft", EpisodeConfirmed: true}}
	app := New(repo)
	_, err := app.LaunchBottle(context.Background(), "user", "bottle")
	var problem *domain.Problem
	if !errors.As(err, &problem) || problem.Code != "TARGET_CONFIRMATION_REQUIRED" {
		t.Fatalf("expected target confirmation problem, got %v", err)
	}
	if repo.launched {
		t.Fatal("repository launch must not run")
	}
}

func TestLaunchConfirmedBottle(t *testing.T) {
	repo := &fakeRepository{bottle: domain.Bottle{
		ID: "bottle", Status: "draft", EpisodeConfirmed: true,
		Target: domain.TargetRules{RequiredExperiences: []string{"经历过实习受挫"}},
	}}
	app := New(repo)
	result, err := app.LaunchBottle(context.Background(), "user", "bottle")
	if err != nil {
		t.Fatal(err)
	}
	if !repo.launched || result.Status != "searching" {
		t.Fatalf("expected searching launch, got %#v", result)
	}
}
