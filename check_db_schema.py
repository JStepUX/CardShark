import sqlite3

db_path = "cardshark.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(characters)")
columns = cursor.fetchall()
col_names = [col[1] for col in columns]
print("Columns in 'characters' table:")
for col in columns:
    print(col)

cursor.execute("SELECT * FROM characters LIMIT 1")
sample = cursor.fetchone()
print("\nSample row with column names:")
if sample:
    for name, value in zip(col_names, sample):
        print(f"{name}: {value}")
else:
    print("No characters found.")

conn.close()
