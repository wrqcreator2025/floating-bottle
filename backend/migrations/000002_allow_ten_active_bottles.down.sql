-- This rollback intentionally fails if a user currently owns multiple slots.
-- Pause all but one searching bottle per user before rolling back.
ALTER TABLE active_search_slots
    DROP FOREIGN KEY fk_slots_owner,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (user_id),
    ADD CONSTRAINT fk_slots_owner
        FOREIGN KEY (bottle_id, user_id) REFERENCES bottles(id, owner_id);
