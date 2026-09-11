"""Real MySQL constraint tests; fixtures always roll back (requires migrated DB)."""
import subprocess
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
CLIENT = [
    "docker", "compose", "exec", "-T", "mysql", "sh", "-c",
    'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --default-character-set=utf8mb4 '
    '--batch --skip-column-names -u "$MYSQL_USER" "$MYSQL_DATABASE"',
]
FIXTURE = """
START TRANSACTION;
INSERT INTO users(id) VALUES ('TEST_DB_OWNER'), ('TEST_DB_READER_A'), ('TEST_DB_READER_B');
INSERT INTO bottles(id,owner_id,episode_raw) VALUES
 ('TEST_DB_BOTTLE_A','TEST_DB_OWNER','你好 🌊'),
 ('TEST_DB_BOTTLE_B','TEST_DB_OWNER','第二个瓶子');
INSERT INTO experiences(id,owner_id,title,body,disclosure,confirmed_by_user,receive_open)
 VALUES ('TEST_DB_EXP','TEST_DB_READER_A','经历','本人确认',JSON_OBJECT(),1,1);
INSERT INTO match_invitations
 (id,bottle_id,search_round,recipient_id,matched_experience_id,experience_snapshot,reason,expires_at)
 VALUES ('TEST_DB_INV_A','TEST_DB_BOTTLE_A',1,'TEST_DB_READER_A','TEST_DB_EXP',
 JSON_OBJECT('title','当时的经历'),'经历相似',UTC_TIMESTAMP() + INTERVAL 1 DAY),
 ('TEST_DB_INV_B','TEST_DB_BOTTLE_A',1,'TEST_DB_READER_B',NULL,
 JSON_OBJECT('title','另一位的经历'),'经历相似',UTC_TIMESTAMP() + INTERVAL 1 DAY);
INSERT INTO connections(id,bottle_id,invitation_id,seeker_id,responder_id) VALUES
 ('TEST_DB_CON_A','TEST_DB_BOTTLE_A','TEST_DB_INV_A','TEST_DB_OWNER','TEST_DB_READER_A'),
 ('TEST_DB_CON_B','TEST_DB_BOTTLE_A','TEST_DB_INV_B','TEST_DB_OWNER','TEST_DB_READER_B');
"""


class DatabaseTests(unittest.TestCase):
    def sql(self, sql, error=None):
        result = subprocess.run(CLIENT, cwd=BACKEND, input=FIXTURE + sql + '\nROLLBACK;\n',
                                text=True, capture_output=True, timeout=30)
        if error:
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(f'ERROR {error} ', result.stderr)
        else:
            self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def test_multiple_responders_and_unicode(self):
        self.assertEqual(self.sql("SELECT COUNT(*) FROM connections WHERE bottle_id='TEST_DB_BOTTLE_A';"
                                  "SELECT episode_raw FROM bottles WHERE id='TEST_DB_BOTTLE_A';"),
                         '2\n你好 🌊')

    def test_one_active_bottle_per_owner(self):
        self.sql("INSERT INTO active_search_slots VALUES ('TEST_DB_OWNER','TEST_DB_BOTTLE_A',NOW());"
                 "INSERT INTO active_search_slots VALUES ('TEST_DB_OWNER','TEST_DB_BOTTLE_B',NOW());", 1062)

    def test_slot_cannot_claim_another_users_bottle(self):
        self.sql("INSERT INTO active_search_slots VALUES ('TEST_DB_READER_A','TEST_DB_BOTTLE_A',NOW());", 1452)

    def test_invitation_not_repeated_in_new_round(self):
        self.sql("INSERT INTO match_invitations (id,bottle_id,search_round,recipient_id,experience_snapshot,reason,expires_at)"
                 " VALUES ('TEST_DB_DUP','TEST_DB_BOTTLE_A',2,'TEST_DB_READER_A',JSON_OBJECT(),'重试',NOW());", 1062)

    def test_connection_cannot_switch_recipient(self):
        self.sql("INSERT INTO users(id) VALUES ('TEST_DB_UNRELATED');"
                 "UPDATE connections SET responder_id='TEST_DB_UNRELATED' WHERE id='TEST_DB_CON_A';", 1452)

    def test_experience_delete_preserves_snapshot(self):
        self.assertEqual(self.sql("DELETE FROM experiences WHERE id='TEST_DB_EXP';"
                                  "SELECT matched_experience_id IS NULL, JSON_UNQUOTE(JSON_EXTRACT(experience_snapshot,'$.title'))"
                                  " FROM match_invitations WHERE id='TEST_DB_INV_A';"), '1\t当时的经历')

    def test_unconfirmed_experience_cannot_receive(self):
        self.sql("UPDATE experiences SET confirmed_by_user=0 WHERE id='TEST_DB_EXP';", 3819)

    def test_message_sequence_unique_within_connection(self):
        insert = "INSERT INTO messages(id,connection_id,sender_id,sequence_no,body) VALUES "
        self.sql(insert + "('TEST_DB_MSG_A','TEST_DB_CON_A','TEST_DB_READER_A',1,'第一封');" +
                 insert + "('TEST_DB_MSG_B','TEST_DB_CON_A','TEST_DB_READER_A',1,'重复');", 1062)

    def test_messages_are_not_delivered_by_default(self):
        self.assertEqual(self.sql("INSERT INTO messages(id,connection_id,sender_id,sequence_no,body)"
                                  " VALUES ('TEST_DB_MSG_A','TEST_DB_CON_A','TEST_DB_READER_A',1,'待审核');"
                                  "SELECT delivery_status FROM messages WHERE id='TEST_DB_MSG_A';"), 'pending_moderation')

    def test_moderation_binds_content_version(self):
        insert = "INSERT INTO moderation_reviews(id,resource_type,resource_id,content_version,content_hash) VALUES "
        self.sql(insert + "('TEST_DB_REVIEW_A','bottle','TEST_DB_BOTTLE_A',1,REPEAT('a',64));" +
                 insert + "('TEST_DB_REVIEW_B','bottle','TEST_DB_BOTTLE_A',1,REPEAT('b',64));", 1062)

    def test_notifications_deduplicate(self):
        insert = "INSERT INTO notifications(id,event_key,user_id,type,resource_type,resource_id,title) VALUES "
        self.sql(insert + "('TEST_DB_N_A','TEST_DB_EVENT','TEST_DB_OWNER','reply','connection','TEST_DB_CON_A','来信');" +
                 insert + "('TEST_DB_N_B','TEST_DB_EVENT','TEST_DB_OWNER','reply','connection','TEST_DB_CON_A','来信');", 1062)

    def test_chat_session_matches_invitation(self):
        self.sql("INSERT INTO chat_invitations(id,connection_id) VALUES ('TEST_DB_CHAT_INV','TEST_DB_CON_A');"
                 "INSERT INTO chat_sessions(id,connection_id,invitation_id)"
                 " VALUES ('TEST_DB_CHAT','TEST_DB_CON_B','TEST_DB_CHAT_INV');", 1452)


if __name__ == '__main__':
    unittest.main()
