// Package mysql contains the database/sql implementation of core repositories.
package mysql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	driver "github.com/go-sql-driver/mysql"
	"github.com/oklog/ulid/v2"

	"github.com/xuanlight/floating-bottle/backend/internal/domain"
)

type Repository struct {
	db *sql.DB
}

func Open(dsn string) (*sql.DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(3 * time.Minute)
	return db, nil
}

func New(db *sql.DB) *Repository { return &Repository{db: db} }

func newID() string { return ulid.Make().String() }

func (r *Repository) Ping(ctx context.Context) error { return r.db.PingContext(ctx) }

func (r *Repository) EnsureUser(ctx context.Context, subject string) (string, error) {
	var id string
	err := r.db.QueryRowContext(ctx, `SELECT id FROM users WHERE external_subject = ?`, subject).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("find user: %w", err)
	}

	id = newID()
	if _, err = r.db.ExecContext(ctx, `INSERT INTO users (id, external_subject) VALUES (?, ?)`, id, subject); err == nil {
		return id, nil
	}
	if !isDuplicate(err) {
		return "", fmt.Errorf("create user: %w", err)
	}
	if err = r.db.QueryRowContext(ctx, `SELECT id FROM users WHERE external_subject = ?`, subject).Scan(&id); err != nil {
		return "", fmt.Errorf("read concurrently created user: %w", err)
	}
	return id, nil
}

func (r *Repository) ListExperiences(ctx context.Context, ownerID string) ([]domain.Experience, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, title, body, confirmed_by_user, receive_open, disclosure, source, created_at, updated_at
		FROM experiences WHERE owner_id = ? ORDER BY updated_at DESC, id DESC`, ownerID)
	if err != nil {
		return nil, fmt.Errorf("list experiences: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Experience, 0)
	for rows.Next() {
		item, err := scanExperience(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate experiences: %w", err)
	}
	return items, nil
}

func (r *Repository) CreateExperience(ctx context.Context, ownerID string, item domain.Experience) (domain.Experience, error) {
	disclosure, err := json.Marshal(item.Disclosure)
	if err != nil {
		return domain.Experience{}, fmt.Errorf("encode disclosure: %w", err)
	}
	item.ID = newID()
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO experiences
		(id, owner_id, title, body, confirmed_by_user, receive_open, disclosure, source)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, item.ID, ownerID, item.Title, item.Body,
		item.ConfirmedByUser, item.ReceiveOpen, disclosure, item.Source)
	if err != nil {
		return domain.Experience{}, fmt.Errorf("create experience: %w", err)
	}
	return r.GetExperience(ctx, ownerID, item.ID)
}

func (r *Repository) GetExperience(ctx context.Context, ownerID, id string) (domain.Experience, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, title, body, confirmed_by_user, receive_open, disclosure, source, created_at, updated_at
		FROM experiences WHERE id = ? AND owner_id = ?`, id, ownerID)
	item, err := scanExperience(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Experience{}, domain.ErrNotFound
	}
	return item, err
}

func (r *Repository) UpdateExperience(ctx context.Context, ownerID, id string, patch domain.ExperiencePatch) (domain.Experience, error) {
	sets := make([]string, 0, 5)
	args := make([]any, 0, 7)
	if patch.Title != nil {
		sets, args = append(sets, "title = ?"), append(args, *patch.Title)
	}
	if patch.Body != nil {
		sets, args = append(sets, "body = ?"), append(args, *patch.Body)
	}
	if patch.ConfirmedByUser != nil {
		sets, args = append(sets, "confirmed_by_user = ?"), append(args, *patch.ConfirmedByUser)
	}
	if patch.ReceiveOpen != nil {
		sets, args = append(sets, "receive_open = ?"), append(args, *patch.ReceiveOpen)
	}
	if patch.Disclosure != nil {
		value, err := json.Marshal(*patch.Disclosure)
		if err != nil {
			return domain.Experience{}, fmt.Errorf("encode disclosure: %w", err)
		}
		sets, args = append(sets, "disclosure = ?"), append(args, value)
	}
	if len(sets) == 0 {
		return r.GetExperience(ctx, ownerID, id)
	}
	args = append(args, id, ownerID)
	_, err := r.db.ExecContext(ctx, `UPDATE experiences SET `+strings.Join(sets, ", ")+` WHERE id = ? AND owner_id = ?`, args...)
	if err != nil {
		if isCheckViolation(err) {
			return domain.Experience{}, domain.NewProblem("EXPERIENCE_CONFIRMATION_REQUIRED", "开启接收前必须确认这是本人经历", domain.ErrConflict)
		}
		return domain.Experience{}, fmt.Errorf("update experience: %w", err)
	}
	return r.GetExperience(ctx, ownerID, id)
}

func (r *Repository) DeleteExperience(ctx context.Context, ownerID, id string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM experiences WHERE id = ? AND owner_id = ?`, id, ownerID)
	if err != nil {
		return fmt.Errorf("delete experience: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *Repository) CreateBottle(ctx context.Context, ownerID, episodeText, targetHint string) (domain.Bottle, error) {
	id := newID()
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO bottles (id, owner_id, episode_raw, target_hint)
		VALUES (?, ?, ?, NULLIF(?, ''))`, id, ownerID, episodeText, targetHint)
	if err != nil {
		return domain.Bottle{}, fmt.Errorf("create bottle: %w", err)
	}
	return r.GetBottle(ctx, ownerID, id)
}

func (r *Repository) GetBottle(ctx context.Context, ownerID, id string) (domain.Bottle, error) {
	row := r.db.QueryRowContext(ctx, bottleSelect+` WHERE id = ? AND owner_id = ?`, id, ownerID)
	item, err := scanBottle(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Bottle{}, domain.ErrNotFound
	}
	return item, err
}

func (r *Repository) UpdateBottle(ctx context.Context, ownerID, id string, patch domain.BottlePatch) (domain.Bottle, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Bottle{}, fmt.Errorf("begin bottle update: %w", err)
	}
	defer tx.Rollback()

	current, err := getBottleTx(ctx, tx, ownerID, id, true)
	if err != nil {
		return domain.Bottle{}, err
	}
	if current.Status != "draft" {
		return domain.Bottle{}, domain.NewProblem("INVALID_BOTTLE_STATE", "只有草稿状态的瓶子可以修改", domain.ErrConflict)
	}
	if patch.SourceVersion != nil && *patch.SourceVersion != current.ContentVersion {
		return domain.Bottle{}, domain.NewProblem("STALE_AI_DRAFT", "瓶子内容已变化，请重新整理", domain.ErrConflict)
	}

	sets := make([]string, 0, 6)
	args := make([]any, 0, 8)
	if patch.EpisodeRaw != nil {
		sets, args = append(sets, "episode_raw = ?"), append(args, *patch.EpisodeRaw)
		if patch.EpisodeConfirmed == nil {
			sets = append(sets, "episode_confirmed = NULL")
		}
	}
	if patch.EpisodeTitle != nil {
		sets, args = append(sets, "episode_title = NULLIF(?, '')"), append(args, *patch.EpisodeTitle)
	}
	if patch.EpisodeConfirmed != nil {
		if *patch.EpisodeConfirmed {
			confirmedText := current.EpisodeRaw
			if patch.EpisodeRaw != nil {
				confirmedText = *patch.EpisodeRaw
			}
			sets, args = append(sets, "episode_confirmed = ?"), append(args, confirmedText)
		} else {
			sets = append(sets, "episode_confirmed = NULL")
		}
	}
	if patch.TargetHint != nil {
		sets, args = append(sets, "target_hint = NULLIF(?, '')"), append(args, *patch.TargetHint)
	}
	if patch.Target != nil {
		value, marshalErr := json.Marshal(*patch.Target)
		if marshalErr != nil {
			return domain.Bottle{}, fmt.Errorf("encode target rules: %w", marshalErr)
		}
		sets, args = append(sets, "target_rules = ?"), append(args, value)
	}
	if len(sets) == 0 {
		return current, nil
	}
	sets = append(sets, "content_version = content_version + 1")
	args = append(args, id, ownerID)
	if _, err = tx.ExecContext(ctx, `UPDATE bottles SET `+strings.Join(sets, ", ")+` WHERE id = ? AND owner_id = ?`, args...); err != nil {
		return domain.Bottle{}, fmt.Errorf("update bottle: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return domain.Bottle{}, fmt.Errorf("commit bottle update: %w", err)
	}
	return r.GetBottle(ctx, ownerID, id)
}

func (r *Repository) LaunchBottle(ctx context.Context, ownerID, id string) (domain.LaunchResult, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.LaunchResult{}, fmt.Errorf("begin launch: %w", err)
	}
	defer tx.Rollback()

	bottle, err := getBottleTx(ctx, tx, ownerID, id, true)
	if err != nil {
		return domain.LaunchResult{}, err
	}
	if bottle.Status == "searching" {
		return domain.LaunchResult{BottleID: id, Status: "searching", Interaction: "throw_to_sea"}, nil
	}
	if bottle.Status != "draft" {
		return domain.LaunchResult{}, domain.NewProblem("INVALID_BOTTLE_STATE", "当前瓶子状态不能抛出", domain.ErrConflict)
	}

	if _, err = tx.ExecContext(ctx, `INSERT INTO active_search_slots (user_id, bottle_id) VALUES (?, ?)`, ownerID, id); err != nil {
		if isDuplicate(err) {
			var activeID string
			queryErr := tx.QueryRowContext(ctx, `SELECT bottle_id FROM active_search_slots WHERE user_id = ?`, ownerID).Scan(&activeID)
			problem := domain.NewProblem("ACTIVE_BOTTLE_EXISTS", "已有一个瓶子正在寻找过来人", domain.ErrConflict)
			if queryErr == nil {
				problem.Details = map[string]any{"activeBottleId": activeID}
			}
			return domain.LaunchResult{}, problem
		}
		return domain.LaunchResult{}, fmt.Errorf("claim active search slot: %w", err)
	}

	searchRound := bottle.SearchRound
	if searchRound == 0 {
		searchRound = 1
	}
	if _, err = tx.ExecContext(ctx, `
		UPDATE bottles SET status = 'searching', search_round = ?, launched_at = COALESCE(launched_at, UTC_TIMESTAMP(6))
		WHERE id = ? AND owner_id = ? AND status = 'draft'`, searchRound, id, ownerID); err != nil {
		return domain.LaunchResult{}, fmt.Errorf("mark bottle searching: %w", err)
	}
	payload, _ := json.Marshal(map[string]any{"bottleId": id, "searchRound": searchRound})
	eventKey := fmt.Sprintf("match_bottle:%s:%d", id, searchRound)
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO outbox_jobs (id, type, event_key, payload)
		VALUES (?, 'match_bottle', ?, ?)`, newID(), eventKey, payload); err != nil && !isDuplicate(err) {
		return domain.LaunchResult{}, fmt.Errorf("enqueue bottle matching: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return domain.LaunchResult{}, fmt.Errorf("commit launch: %w", err)
	}
	return domain.LaunchResult{BottleID: id, Status: "searching", Interaction: "throw_to_sea"}, nil
}

const bottleSelect = `
	SELECT id, episode_raw, COALESCE(episode_title, ''), episode_confirmed,
	       COALESCE(target_hint, ''), target_rules, status, content_version, search_round,
	       COALESCE(failure_reason, ''), created_at, updated_at, launched_at
	FROM bottles`

type scanner interface {
	Scan(dest ...any) error
}

func scanExperience(row scanner) (domain.Experience, error) {
	var item domain.Experience
	var disclosure []byte
	if err := row.Scan(&item.ID, &item.Title, &item.Body, &item.ConfirmedByUser, &item.ReceiveOpen,
		&disclosure, &item.Source, &item.CreatedAt, &item.UpdatedAt); err != nil {
		return domain.Experience{}, err
	}
	if err := json.Unmarshal(disclosure, &item.Disclosure); err != nil {
		return domain.Experience{}, fmt.Errorf("decode experience disclosure: %w", err)
	}
	return item, nil
}

func scanBottle(row scanner) (domain.Bottle, error) {
	var item domain.Bottle
	var confirmed sql.NullString
	var target []byte
	var launched sql.NullTime
	err := row.Scan(&item.ID, &item.EpisodeRaw, &item.EpisodeTitle, &confirmed, &item.TargetHint,
		&target, &item.Status, &item.ContentVersion, &item.SearchRound, &item.FailureReason,
		&item.CreatedAt, &item.UpdatedAt, &launched)
	if err != nil {
		return domain.Bottle{}, err
	}
	item.OwnerRole = "sender"
	item.EpisodeConfirmed = confirmed.Valid
	if len(target) > 0 {
		if err := json.Unmarshal(target, &item.Target); err != nil {
			return domain.Bottle{}, fmt.Errorf("decode bottle target: %w", err)
		}
	}
	if item.Target.RequiredExperiences == nil {
		item.Target.RequiredExperiences = []string{}
	}
	if item.Target.PreferredExperiences == nil {
		item.Target.PreferredExperiences = []string{}
	}
	if item.Target.ViewpointPreferences == nil {
		item.Target.ViewpointPreferences = []string{}
	}
	if launched.Valid {
		item.LaunchedAt = &launched.Time
	}
	return item, nil
}

func getBottleTx(ctx context.Context, tx *sql.Tx, ownerID, id string, lock bool) (domain.Bottle, error) {
	query := bottleSelect + ` WHERE id = ? AND owner_id = ?`
	if lock {
		query += ` FOR UPDATE`
	}
	item, err := scanBottle(tx.QueryRowContext(ctx, query, id, ownerID))
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Bottle{}, domain.ErrNotFound
	}
	return item, err
}

func isDuplicate(err error) bool {
	var mysqlErr *driver.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == 1062
}

func isCheckViolation(err error) bool {
	var mysqlErr *driver.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == 3819
}
