// Package domain defines the business objects shared by services and adapters.
package domain

import (
	"errors"
	"time"
)

var (
	ErrNotFound = errors.New("resource not found")
	ErrConflict = errors.New("resource conflict")
)

const MaxActiveSearches = 10

// Problem is a stable business error that the HTTP layer can safely expose.
type Problem struct {
	Code    string
	Message string
	Details map[string]any
	Cause   error
}

func (p *Problem) Error() string { return p.Message }
func (p *Problem) Unwrap() error { return p.Cause }

func NewProblem(code, message string, cause error) *Problem {
	return &Problem{Code: code, Message: message, Cause: cause}
}

type Disclosure struct {
	Summary   bool `json:"summary"`
	TimeRange bool `json:"timeRange"`
	Domain    bool `json:"domain"`
}

type Experience struct {
	ID              string     `json:"id"`
	Title           string     `json:"title"`
	Body            string     `json:"body"`
	ConfirmedByUser bool       `json:"confirmedByUser"`
	ReceiveOpen     bool       `json:"receiveOpen"`
	Disclosure      Disclosure `json:"disclosure"`
	Source          string     `json:"source"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

type ExperiencePatch struct {
	Title           *string
	Body            *string
	ConfirmedByUser *bool
	ReceiveOpen     *bool
	Disclosure      *Disclosure
}

type TargetRules struct {
	RequiredExperiences  []string `json:"requiredExperiences"`
	PreferredExperiences []string `json:"preferredExperiences"`
	ViewpointPreferences []string `json:"viewpointPreferences"`
}

type Bottle struct {
	ID               string
	OwnerRole        string
	EpisodeRaw       string
	EpisodeTitle     string
	EpisodeConfirmed bool
	TargetHint       string
	Target           TargetRules
	Status           string
	ContentVersion   uint
	SearchRound      uint
	FailureReason    string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	LaunchedAt       *time.Time
}

type BottlePatch struct {
	EpisodeRaw       *string
	EpisodeTitle     *string
	EpisodeConfirmed *bool
	TargetHint       *string
	Target           *TargetRules
	SourceVersion    *uint
}

type BottleView struct {
	ID        string `json:"id"`
	OwnerRole string `json:"ownerRole"`
	Episode   struct {
		RawText   string `json:"rawText"`
		Title     string `json:"title"`
		Confirmed bool   `json:"confirmed"`
	} `json:"episode"`
	Target         TargetRules `json:"target"`
	TargetHint     string      `json:"targetHint,omitempty"`
	Status         string      `json:"status"`
	ContentVersion uint        `json:"contentVersion"`
	SearchRound    uint        `json:"searchRound"`
	FailureReason  string      `json:"failureReason,omitempty"`
	CreatedAt      time.Time   `json:"createdAt"`
	UpdatedAt      time.Time   `json:"updatedAt"`
	LaunchedAt     *time.Time  `json:"launchedAt"`
}

func ViewBottle(b Bottle) BottleView {
	v := BottleView{
		ID: b.ID, OwnerRole: b.OwnerRole, Target: b.Target, TargetHint: b.TargetHint,
		Status: b.Status, ContentVersion: b.ContentVersion, SearchRound: b.SearchRound,
		FailureReason: b.FailureReason, CreatedAt: b.CreatedAt, UpdatedAt: b.UpdatedAt,
		LaunchedAt: b.LaunchedAt,
	}
	v.Episode.RawText = b.EpisodeRaw
	v.Episode.Title = b.EpisodeTitle
	v.Episode.Confirmed = b.EpisodeConfirmed
	return v
}

type LaunchResult struct {
	BottleID    string `json:"bottleId"`
	Status      string `json:"status"`
	Interaction string `json:"interaction"`
}
