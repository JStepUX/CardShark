#!/usr/bin/env python3
"""
CardShark Migration Verification Module

This module provides comprehensive verification and validation functionality for the
CardShark database migration system. It includes schema validation, data integrity
checks, and migration consistency verification.

Author: CardShark Development Team

Version History:
v1.0.0 - 2025-05-27 - Initial version of this script.
v1.0.1 - 2025-05-27 - Applied fixes for indentation, docstrings, try/finally,
                      comment alignment, and added version history.
"""

import sqlite3
import hashlib
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
import sys

# Add the project root to the Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from setup_migration_table import (
        get_database_path, get_database_engine, get_migration_history,
        get_current_schema_version, verify_migration_integrity,
        DatabasePathError, MigrationTableError
    )
except ImportError as e:
    print(f"Error importing migration modules: {e}")
    sys.exit(1)


class MigrationVerificationError(Exception):
    """Exception raised when migration verification fails."""
    pass


class SchemaValidationError(Exception):
    """Exception raised when schema validation fails."""
    pass


def get_database_schema(engine) -> Dict[str, Any]:
    """
    Extract complete database schema information.
    
    Args:
        engine: SQLAlchemy database engine
        
    Returns:
        Dictionary containing complete schema information
        
    Raises:
        MigrationVerificationError: If schema extraction fails
    """
    try:
        schema = {
            'tables': {},
            'indexes': {},
            'triggers': {},
            'views': {},
            'metadata': {
                'extraction_time': datetime.now().isoformat(),
                'database_path': str(get_database_path())
            }
        }
        
        with engine.connect() as conn:
            # Extract table information
            tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
            
            for (table_name,) in tables:
                schema['tables'][table_name] = {
                    'columns': [],
                    'constraints': [],
                    'foreign_keys': []
                }
                
                # Get column information
                columns = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
                for col in columns:
                    schema['tables'][table_name]['columns'].append({
                        'cid': col[0],
                        'name': col[1],
                        'type': col[2],
                        'notnull': bool(col[3]),
                        'default_value': col[4],
                        'pk': bool(col[5])
                    })
                
                # Get foreign key information
                fks = conn.execute(f"PRAGMA foreign_key_list({table_name})").fetchall()
                for fk in fks:
                    schema['tables'][table_name]['foreign_keys'].append({
                        'id': fk[0],
                        'seq': fk[1],
                        'table': fk[2],
                        'from': fk[3],
                        'to': fk[4],
                        'on_update': fk[5],
                        'on_delete': fk[6],
                        'match': fk[7]
                    })
            
            # Extract index information
            indexes = conn.execute(
                "SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name"
            ).fetchall()
            
            for name, sql in indexes:
                schema['indexes'][name] = {
                    'sql': sql,
                    'table': None  # Will be extracted from SQL if needed
                }
            
            # Extract trigger information
            triggers = conn.execute(
                "SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name"
            ).fetchall()
            
            for name, sql in triggers:
                schema['triggers'][name] = {
                    'sql': sql
                }
            
            # Extract view information
            views = conn.execute(
                "SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name"
            ).fetchall()
            
            for name, sql in views:
                schema['views'][name] = {
                    'sql': sql
                }
        
        return schema
        
    except Exception as e:
        raise MigrationVerificationError(f"Failed to extract database schema: {e}")


def calculate_schema_checksum(schema: Dict[str, Any]) -> str:
    """
    Calculate a checksum for the database schema.
    
    Args:
        schema: Schema dictionary from get_database_schema()
        
    Returns:
        SHA-256 checksum of the schema
    """
    # Remove metadata that changes between extractions
    schema_copy = schema.copy()
    if 'metadata' in schema_copy:
        del schema_copy['metadata']
    
    # Convert to sorted JSON for consistent hashing
    schema_json = json.dumps(schema_copy, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(schema_json.encode('utf-8')).hexdigest()


def verify_migration_consistency(engine) -> Tuple[bool, List[str]]:
    """
    Verify that migrations are consistent and in proper order.
    
    Args:
        engine: SQLAlchemy database engine
        
    Returns:
        Tuple of (is_consistent, list_of_issues)
    """
    issues = []
    
    try:
        history = get_migration_history(engine)
        
        if not history:
            return True, []
        
        # Check for duplicate versions
        versions = [record[1] for record in history]  # version is at index 1
        if len(versions) != len(set(versions)):
            duplicates = [v for v in set(versions) if versions.count(v) > 1]
            issues.append(f"Duplicate migration versions found: {duplicates}")
        
        # Check chronological order
        timestamps = [record[2] for record in history]  # applied_at is at index 2
        for i in range(1, len(timestamps)):
            if timestamps[i] < timestamps[i-1]:
                issues.append(f"Migration timestamps are not in chronological order at position {i}")
        
        # Check for missing rollback information
        for record in history:
            version = record[1]
            rollback_sql = record[4]  # rollback_sql is at index 4
            if not rollback_sql or rollback_sql.strip() == '':
                issues.append(f"Migration {version} has no rollback SQL")
            # Check checksum integrity
        integrity_result = verify_migration_integrity(engine)
        integrity_check = _handle_integrity_result(integrity_result)
        if not integrity_check:
            issues.append("Migration integrity check failed - checksums may be corrupted")
        
        return len(issues) == 0, issues
        
    except Exception as e:
        issues.append(f"Error during migration consistency check: {e}")
        return False, issues


def verify_database_constraints(engine) -> Tuple[bool, List[str]]:
    """
    Verify database constraints and referential integrity.
    
    Args:
        engine: SQLAlchemy database engine
        
    Returns:
        Tuple of (is_valid, list_of_constraint_violations)
    """
    violations = []
    
    try:
        with engine.connect() as conn:
            # Enable foreign key constraint checking
            conn.execute("PRAGMA foreign_keys = ON")
            
            # Run integrity check
            integrity_results = conn.execute("PRAGMA integrity_check").fetchall()
            
            for result in integrity_results:
                if result[0] != "ok":
                    violations.append(f"Database integrity issue: {result[0]}")
            
            # Run foreign key check
            fk_results = conn.execute("PRAGMA foreign_key_check").fetchall()
            
            for result in fk_results:
                violations.append(
                    f"Foreign key violation in table '{result[0]}', "
                    f"rowid {result[1]}, parent table '{result[2]}', "
                    f"foreign key index {result[3]}"
                )
        
        return len(violations) == 0, violations
        
    except Exception as e:
        violations.append(f"Error during constraint verification: {e}")
        return False, violations


def verify_required_tables(engine, required_tables: List[str] = None) -> Tuple[bool, List[str]]:
    """
    Verify that all required tables exist in the database.
    
    Args:
        engine: SQLAlchemy database engine
        required_tables: List of required table names (default: CardShark core tables)
        
    Returns:
        Tuple of (all_present, list_of_missing_tables)
    """
    if required_tables is None:
        # Default CardShark required tables
        required_tables = [
            'database_migrations',
            'chat_sessions',
            'chat_messages',
            'user_profiles',
            'api_configurations',
            'templates'
        ]
    
    missing_tables = []
    
    try:
        with engine.connect() as conn:
            existing_tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
            existing_table_names = {table[0] for table in existing_tables}
            
            for table in required_tables:
                if table not in existing_table_names:
                    missing_tables.append(table)
        
        return len(missing_tables) == 0, missing_tables
        
    except Exception as e:
        missing_tables.append(f"Error checking table existence: {e}")
        return False, missing_tables


def generate_migration_report(engine) -> Dict[str, Any]:
    """
    Generate a comprehensive migration system report.
    
    Args:
        engine: SQLAlchemy database engine
        
    Returns:
        Dictionary containing complete migration report
    """
    report = {
        'timestamp': datetime.now().isoformat(),
        'database_path': str(get_database_path()),
        'migration_system': {},
        'schema': {},
        'consistency': {},
        'constraints': {},
        'required_tables': {},
        'summary': {}
    }
    
    try:
        # Migration system information
        current_version = get_current_schema_version(engine)
        history = get_migration_history(engine)
        integrity_result = verify_migration_integrity(engine)
        integrity = _handle_integrity_result(integrity_result)
        
        report['migration_system'] = {
            'current_version': current_version,
            'total_migrations': len(history),
            'integrity_check': integrity,
            'migration_history': [
                {
                    'id': record[0],
                    'version': record[1],
                    'applied_at': record[2],
                    'description': record[3],
                    'is_rollback': record[5]
                }
                for record in history
            ]
        }
        
        # Schema information
        schema = get_database_schema(engine)
        schema_checksum = calculate_schema_checksum(schema)
        
        report['schema'] = {
            'checksum': schema_checksum,
            'table_count': len(schema['tables']),
            'index_count': len(schema['indexes']),
            'trigger_count': len(schema['triggers']),
            'view_count': len(schema['views']),
            'tables': list(schema['tables'].keys())
        }
        
        # Consistency checks
        consistency_valid, consistency_issues = verify_migration_consistency(engine)
        report['consistency'] = {
            'is_valid': consistency_valid,
            'issues': consistency_issues
        }
        
        # Constraint checks
        constraints_valid, constraint_violations = verify_database_constraints(engine)
        report['constraints'] = {
            'is_valid': constraints_valid,
            'violations': constraint_violations
        }
        
        # Required tables check
        tables_present, missing_tables = verify_required_tables(engine)
        report['required_tables'] = {
            'all_present': tables_present,
            'missing_tables': missing_tables
        }
        # Overall summary
        all_checks_passed = (
            integrity and 
            consistency_valid and 
            constraints_valid and 
            tables_present
        )
        
        report['summary'] = {
            'overall_status': 'PASS' if all_checks_passed else 'FAIL',
            'checks_performed': 5,
            'checks_passed': sum([
                1 if integrity else 0,
                1 if consistency_valid else 0,
                1 if constraints_valid else 0,
                1 if tables_present else 0,
                1  # Schema extraction (if we got this far)
            ]),
            'critical_issues': len([
                issue for issue in (
                    consistency_issues + 
                    constraint_violations + 
                    missing_tables
                ) if issue
            ])
        }
        
    except Exception as e:
        report['error'] = str(e)
        report['summary'] = {
            'overall_status': 'ERROR',
            'error_message': str(e)
        }
    
    return report


def save_verification_report(report: Dict[str, Any], output_path: Optional[Path] = None) -> Path:
    """
    Save verification report to a JSON file.
    
    Args:
        report: Report dictionary from generate_migration_report()
        output_path: Optional path for the report file
        
    Returns:
        Path to the saved report file
    """
    if output_path is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = PROJECT_ROOT / f"migration_verification_report_{timestamp}.json"
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    return output_path


def print_verification_summary(report: Dict[str, Any]):
    """
    Print a human-readable summary of the verification report.

    Args:
        report (Dict[str, Any]): Report dictionary from generate_migration_report().
    """
    print("CardShark Migration System Verification Report")
    print("=" * 60)
    
    if 'error' in report:
        print(f"❌ ERROR: {report['error']}")
        return
    
    summary = report.get('summary', {})
    status = summary.get('overall_status', 'UNKNOWN')
    
    if status == 'PASS':
        print("✅ Overall Status: PASS")
    elif status == 'FAIL':
        print("❌ Overall Status: FAIL")
    else:
        print(f"⚠️  Overall Status: {status}")
    
    print(f"\nDatabase: {report.get('database_path', 'Unknown')}")
    print(f"Verification Time: {report.get('timestamp', 'Unknown')}")
    
    # Migration system summary
    migration_info = report.get('migration_system', {})
    print(f"\n📊 Migration System:")
    print(f"   Current Version: {migration_info.get('current_version', 'None')}")
    print(f"   Total Migrations: {migration_info.get('total_migrations', 0)}")
    print(f"   Integrity Check: {'✅' if migration_info.get('integrity_check') else '❌'}")
    
    # Schema summary
    schema_info = report.get('schema', {})
    print(f"\n🗃️  Database Schema:")
    print(f"   Tables: {schema_info.get('table_count', 0)}")
    print(f"   Indexes: {schema_info.get('index_count', 0)}")
    print(f"   Triggers: {schema_info.get('trigger_count', 0)}")
    print(f"   Views: {schema_info.get('view_count', 0)}")
    print(f"   Schema Checksum: {schema_info.get('checksum', 'Unknown')[:16]}...")
    
    # Consistency check
    consistency = report.get('consistency', {})
    print(f"\n🔍 Consistency Check: {'✅' if consistency.get('is_valid') else '❌'}")
    for issue in consistency.get('issues', []):
        print(f"   ⚠️  {issue}")
    
    # Constraint check
    constraints = report.get('constraints', {})
    print(f"\n🔗 Constraint Check: {'✅' if constraints.get('is_valid') else '❌'}")
    for violation in constraints.get('violations', []):
        print(f"   ⚠️  {violation}")
    
    # Required tables check
    tables = report.get('required_tables', {})
    print(f"\n📋 Required Tables: {'✅' if tables.get('all_present') else '❌'}")
    for missing in tables.get('missing_tables', []):
        print(f"   ❌ Missing: {missing}")
    
    # Summary statistics
    print(f"\n📈 Summary:")
    print(f"   Checks Performed: {summary.get('checks_performed', 0)}")
    print(f"   Checks Passed: {summary.get('checks_passed', 0)}")
    print(f"   Critical Issues: {summary.get('critical_issues', 0)}")


def verify_migration_system(save_report: bool = True, verbose: bool = True) -> bool:
    """
    Perform complete migration system verification.
    
    Args:
        save_report: Whether to save the verification report to a file
        verbose: Whether to print detailed output
        
    Returns:
        True if all verifications pass, False otherwise
    """
    try:
        if verbose:
            print("Starting CardShark migration system verification...")
        
        # Get database engine
        engine = get_database_engine()
        
        # Generate comprehensive report
        report = generate_migration_report(engine)
        
        # Save report if requested
        if save_report:
            report_path = save_verification_report(report)
            if verbose:
                print(f"\nDetailed report saved to: {report_path}")
        
        # Print summary if verbose
        if verbose:
            print_verification_summary(report)
        
        # Return overall status
        return report.get('summary', {}).get('overall_status') == 'PASS'
        
    except DatabasePathError as e:
        if verbose:
            print(f"❌ Database path error: {e}")
        return False
    except MigrationTableError as e:
        if verbose:
            print(f"❌ Migration table error: {e}")
        return False
    except Exception as e:
        if verbose:
            print(f"❌ Verification error: {e}")
        return False


def _handle_integrity_result(integrity_result) -> bool:
    """
    Handle different types of integrity check results.
    
    Args:
        integrity_result: Result from verify_migration_integrity
        
    Returns:
        bool: True if integrity is valid, False otherwise
    """
    if isinstance(integrity_result, dict):
        return integrity_result.get('status') in ['success', 'warning']
    return bool(integrity_result)


def main():
    """Main function for command-line usage."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="CardShark Migration System Verification Tool"
    )
    parser.add_argument(
        '--no-save', action='store_true',
        help="Don't save verification report to file"
    )
    parser.add_argument(
        '--quiet', action='store_true',
        help="Minimal output (only pass/fail status)"
    )
    parser.add_argument(
        '--output', type=str,
        help="Custom output path for verification report"
    )
    
    args = parser.parse_args()
    
    # Override save_report function if custom output specified
    global save_verification_report  # Ensures we are modifying the global var
    original_save_function = save_verification_report  # Store the original function

    try:
        if args.output:
            # Define the temporary replacement function using the captured original
            def custom_save_logic(report_content, _output_path_ignored=None):
                # Calls the *original* module-level function with the custom path
                return original_save_function(report_content, Path(args.output))
            
            # Replace the global function
            save_verification_report = custom_save_logic
        
        # Run verification
        success = verify_migration_system(
            save_report=not args.no_save,
            verbose=not args.quiet
        )
    finally:
        # Restore original function if it was modified
        if args.output: # This implies it was (or should have been) modified
            save_verification_report = original_save_function
    
    if args.quiet:
        print("PASS" if success else "FAIL")
    
    return 0 if success else 1


if __name__ == "__main__":
    exit(main())