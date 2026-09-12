-- One user may have up to ten searching bottles. The service enforces the
-- numeric limit while holding a lock on the owning users row.
ALTER TABLE active_search_slots
    DROP FOREIGN KEY fk_slots_owner,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (user_id, bottle_id),
    ADD CONSTRAINT fk_slots_owner_v2
        FOREIGN KEY (bottle_id, user_id) REFERENCES bottles(id, owner_id);
