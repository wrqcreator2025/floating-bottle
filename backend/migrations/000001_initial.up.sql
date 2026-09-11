-- Business IDs are bare ULIDs (26 ASCII characters); API prefixes are mapped by Go.
-- All mutable timestamps are maintained by MySQL. All sessions must use UTC.
CREATE TABLE users (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    external_subject VARCHAR(191) COLLATE utf8mb4_bin NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_users_subject (external_subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE bottles (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    owner_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    episode_raw TEXT NOT NULL,
    episode_title VARCHAR(255) NULL,
    episode_confirmed TEXT NULL,
    target_hint TEXT NULL,
    target_rules JSON NULL,
    content_version INT UNSIGNED NOT NULL DEFAULT 1,
    search_round INT UNSIGNED NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    failure_reason VARCHAR(64) NULL,
    launched_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_bottles_owner (id, owner_id),
    KEY ix_bottles_cabinet (owner_id, created_at DESC),
    KEY ix_bottles_status (owner_id, status, updated_at),
    CONSTRAINT fk_bottles_owner FOREIGN KEY (owner_id) REFERENCES users(id),
    CONSTRAINT ck_bottles_version CHECK (content_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE active_search_slots (
    user_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    bottle_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_slots_bottle (bottle_id),
    CONSTRAINT fk_slots_owner FOREIGN KEY (bottle_id, user_id) REFERENCES bottles(id, owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE experiences (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    owner_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(80) NOT NULL,
    body TEXT NOT NULL,
    confirmed_by_user BOOLEAN NOT NULL DEFAULT FALSE,
    receive_open BOOLEAN NOT NULL DEFAULT FALSE,
    disclosure JSON NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'manual',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    KEY ix_experiences_owner (owner_id, updated_at DESC),
    KEY ix_experiences_receive (receive_open, updated_at),
    CONSTRAINT fk_experiences_owner FOREIGN KEY (owner_id) REFERENCES users(id),
    CONSTRAINT ck_experiences_open CHECK (receive_open = 0 OR confirmed_by_user = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE match_invitations (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    bottle_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    search_round INT UNSIGNED NOT NULL,
    recipient_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    matched_experience_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NULL,
    experience_snapshot JSON NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    expires_at DATETIME(6) NOT NULL,
    decided_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_invitations_recipient (bottle_id, recipient_id),
    UNIQUE KEY uq_invitations_connection (id, bottle_id, recipient_id),
    KEY ix_invitations_inbox (recipient_id, status, created_at),
    KEY ix_invitations_bottle (bottle_id, status, created_at),
    KEY ix_invitations_expiry (status, expires_at),
    CONSTRAINT fk_invitations_bottle FOREIGN KEY (bottle_id) REFERENCES bottles(id),
    CONSTRAINT fk_invitations_recipient FOREIGN KEY (recipient_id) REFERENCES users(id),
    CONSTRAINT fk_invitations_experience FOREIGN KEY (matched_experience_id) REFERENCES experiences(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE connections (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    bottle_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    invitation_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    seeker_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    responder_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'awaiting_reply',
    follow_up_used BOOLEAN NOT NULL DEFAULT FALSE,
    closed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_connections_invitation (invitation_id),
    UNIQUE KEY uq_connections_responder (bottle_id, responder_id),
    UNIQUE KEY uq_connections_seeker (id, seeker_id),
    KEY ix_connections_cabinet (responder_id, updated_at DESC),
    CONSTRAINT fk_connections_invitation FOREIGN KEY (invitation_id, bottle_id, responder_id) REFERENCES match_invitations(id, bottle_id, recipient_id),
    CONSTRAINT fk_connections_owner FOREIGN KEY (bottle_id, seeker_id) REFERENCES bottles(id, owner_id),
    CONSTRAINT ck_connections_people CHECK (seeker_id <> responder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE messages (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    connection_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sender_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sequence_no BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'reply',
    body TEXT NOT NULL,
    content_version INT UNSIGNED NOT NULL DEFAULT 1,
    delivery_status VARCHAR(32) NOT NULL DEFAULT 'pending_moderation',
    idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    delivered_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_messages_sequence (connection_id, sequence_no),
    UNIQUE KEY uq_messages_retry (connection_id, sender_id, idempotency_key),
    CONSTRAINT fk_messages_connection FOREIGN KEY (connection_id) REFERENCES connections(id),
    CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id),
    CONSTRAINT ck_messages_sequence CHECK (sequence_no > 0),
    CONSTRAINT ck_messages_version CHECK (content_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE chat_invitations (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    connection_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    decided_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_chat_invitation_connection (connection_id),
    UNIQUE KEY uq_chat_invitation_session (id, connection_id),
    CONSTRAINT fk_chat_invitation_connection FOREIGN KEY (connection_id) REFERENCES connections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE chat_sessions (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    connection_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    invitation_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    closed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_chat_session_connection (connection_id),
    UNIQUE KEY uq_chat_session_invitation (invitation_id),
    CONSTRAINT fk_chat_session_invitation FOREIGN KEY (invitation_id, connection_id) REFERENCES chat_invitations(id, connection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Chat messages use messages(kind='chat') and their connection's active session.
-- Service must validate session acceptance and participants before writing.
CREATE TABLE connection_feedback (
    connection_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    seeker_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    result VARCHAR(32) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_feedback_seeker FOREIGN KEY (connection_id, seeker_id) REFERENCES connections(id, seeker_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notifications (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    event_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    type VARCHAR(64) NOT NULL,
    resource_type VARCHAR(32) NOT NULL,
    resource_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(255) NOT NULL,
    read_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_notifications_event (event_key),
    KEY ix_notifications_unread (user_id, read_at, created_at),
    KEY ix_notifications_page (user_id, created_at, id),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE slice_drafts (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    connection_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    author_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(255) NULL,
    body TEXT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'generating',
    consented_at DATETIME(6) NOT NULL,
    published_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_slices_connection (connection_id),
    CONSTRAINT fk_slices_connection FOREIGN KEY (connection_id) REFERENCES connections(id),
    CONSTRAINT fk_slices_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE moderation_reviews (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    resource_type VARCHAR(32) NOT NULL,
    resource_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    content_version INT UNSIGNED NOT NULL,
    content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    reason_code VARCHAR(64) NULL,
    appeal_text TEXT NULL,
    appealed_at DATETIME(6) NULL,
    reviewed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_review_version (resource_type, resource_id, content_version),
    KEY ix_review_pending (status, created_at),
    CONSTRAINT ck_review_version CHECK (content_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_blocks (
    blocker_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    blocked_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT fk_blocks_blocker FOREIGN KEY (blocker_id) REFERENCES users(id),
    CONSTRAINT fk_blocks_blocked FOREIGN KEY (blocked_id) REFERENCES users(id),
    CONSTRAINT ck_blocks_people CHECK (blocker_id <> blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE abuse_reports (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    reporter_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    connection_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    message_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NULL,
    reason TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    KEY ix_reports_status (status, created_at),
    CONSTRAINT fk_reports_user FOREIGN KEY (reporter_id) REFERENCES users(id),
    CONSTRAINT fk_reports_connection FOREIGN KEY (connection_id) REFERENCES connections(id),
    CONSTRAINT fk_reports_message FOREIGN KEY (message_id) REFERENCES messages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE zhihu_integrations (
    user_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    oauth_token_ciphertext BLOB NULL,
    oauth_expires_at DATETIME(6) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'disconnected',
    last_synced_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_zhihu_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_activity_profiles (
    user_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    features JSON NOT NULL,
    source_types JSON NOT NULL,
    source_updated_at DATETIME(6) NULL,
    refreshed_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    profile_version INT UNSIGNED NOT NULL DEFAULT 1,
    KEY ix_profiles_expiry (expires_at),
    CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE experience_suggestion_jobs (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    user_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    query TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'processing',
    suggestions JSON NULL,
    last_error VARCHAR(64) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    KEY ix_suggestions_user (user_id, created_at DESC),
    CONSTRAINT fk_suggestions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE outbox_jobs (
    id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    type VARCHAR(64) NOT NULL,
    event_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
    payload JSON NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    locked_at DATETIME(6) NULL,
    locked_by VARCHAR(128) NULL,
    completed_at DATETIME(6) NULL,
    last_error VARCHAR(64) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_jobs_event (event_key),
    KEY ix_jobs_available (status, available_at),
    KEY ix_jobs_lease (status, locked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE external_api_cache (
    provider VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    capability VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    response JSON NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (provider, capability, request_hash),
    KEY ix_cache_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE external_api_usage (
    user_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    provider VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    capability VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    usage_date DATE NOT NULL,
    request_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_id, provider, capability, usage_date),
    CONSTRAINT fk_usage_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Shared account quota must not be multiplied by the number of local users.
CREATE TABLE external_api_account_usage (
    account_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    provider VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    capability VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    usage_date DATE NOT NULL,
    request_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (account_key, provider, capability, usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
