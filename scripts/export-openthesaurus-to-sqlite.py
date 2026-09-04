import mysql.connector
import sqlite3

MYSQL_CONFIG = {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "ENTER_YOUR_PASSWORD_HERE",
    "database": "openthesaurus",
}

SQLITE_FILE = "openthesaurus.sqlite"
BATCH_SIZE = 10_000

tables = [
    "category",
    "category_link",
    "link_type",
    "synset",
    "synset_link",
    "tag",
    "term",
    "term_level",
    "term_link",
    "term_link_type",
    "term_tag",
    "word_mapping",
]

mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
sqlite_conn = sqlite3.connect(SQLITE_FILE)

mysql_cur = mysql_conn.cursor()
sqlite_cur = sqlite_conn.cursor()

for table in tables:
    print(f"\n{table}")

    mysql_cur.execute(f"SELECT * FROM `{table}`")

    columns = [column[0] for column in mysql_cur.description]

    sqlite_cur.execute(f'DROP TABLE IF EXISTS "{table}"')

    columns_sql = ", ".join(f'"{column}"' for column in columns)
    sqlite_cur.execute(
        f'CREATE TABLE "{table}" ({columns_sql})'
    )

    placeholders = ", ".join("?" for _ in columns)

    count = 0

    while True:
        rows = mysql_cur.fetchmany(BATCH_SIZE)

        if not rows:
            break

        sqlite_cur.executemany(
            f'INSERT INTO "{table}" VALUES ({placeholders})',
            rows
        )

        count += len(rows)
        print(f"  {count:,}", end="\r")

    sqlite_conn.commit()
    print(f"  {count:,} Datensätze übertragen")

mysql_cur.close()
mysql_conn.close()
sqlite_conn.close()

print(f"\nFertig: {SQLITE_FILE}")