#!/usr/bin/env python3
"""Simple database check script"""
import sqlite3
from pathlib import Path

def main():
    db_path = Path('cardshark.sqlite')
    print(f'Database path: {db_path.absolute()}')
    print(f'Database exists: {db_path.exists()}')
    
    if db_path.exists():
        print(f'Database size: {db_path.stat().st_size} bytes')
        
        try:
            with sqlite3.connect(db_path) as conn:
                # Get all tables
                tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
                table_names = [t[0] for t in tables]
                print(f'Tables ({len(table_names)}): {table_names}')
                
                # Check migration table specifically
                if 'database_migrations' in table_names:
                    migrations = conn.execute("SELECT COUNT(*) FROM database_migrations").fetchone()[0]
                    print(f'Migration records: {migrations}')
                    
                    # Get migration details
                    records = conn.execute("SELECT id, version, description FROM database_migrations ORDER BY applied_at").fetchall()
                    for i, (mid, version, desc) in enumerate(records):
                        print(f'  {i+1}. ID: {mid}, Version: {version}, Desc: {desc}')
                
                if 'database_version' in table_names:
                    version = conn.execute("SELECT version FROM database_version LIMIT 1").fetchone()
                    if version:
                        print(f'Database version: {version[0]}')
                    else:
                        print('Database version table exists but is empty')
                        
        except Exception as e:
            print(f'Database error: {e}')
            import traceback
            traceback.print_exc()
    else:
        print('Database file does not exist')

if __name__ == '__main__':
    main()
