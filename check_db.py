#!/usr/bin/env python3
"""
Simple script to check database contents
"""
import sqlite3
from pathlib import Path

def main():
    db_path = Path('cardshark.sqlite')
    print(f'Database path: {db_path}')
    print(f'Database exists: {db_path.exists()}')
    
    if db_path.exists():
        try:
            with sqlite3.connect(db_path) as conn:
                # Check tables
                tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
                print(f'Tables: {[t[0] for t in tables]}')
                
                # Check migrations if table exists
                if 'database_migrations' in [t[0] for t in tables]:
                    rows = conn.execute('SELECT id, version, applied_at, description FROM database_migrations ORDER BY applied_at').fetchall()
                    print(f'Migration rows: {len(rows)}')
                    for row in rows:
                        print(f'  ID: {row[0]}, Version: {row[1]}, Applied: {row[2]}, Desc: {row[3]}')
                        
                    # Clean up test migrations
                    cursor = conn.execute("DELETE FROM database_migrations WHERE version LIKE '%test%' OR version LIKE '%Integration%'")
                    deleted = cursor.rowcount
                    conn.commit()
                    print(f'Deleted {deleted} test migrations')
                    
                    # Check remaining
                    remaining = conn.execute('SELECT COUNT(*) FROM database_migrations').fetchone()[0]
                    print(f'Remaining migrations: {remaining}')
                else:
                    print('database_migrations table does not exist')
        except Exception as e:
            print(f'Error: {e}')
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    main()
