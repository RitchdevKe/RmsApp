#!/usr/bin/env python3
import glob
import os
import re
import subprocess
import sys
import time

def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower()
            for text in re.split(r'(\d+)', s)]

def get_table_count():
    cmd = ["sudo", "-u", "postgres", "psql", "-d", "taskme_rms", "-tAc",
           "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('public', 'app', 'auth', 'storage');"]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return int(res.stdout.strip())
    except Exception as e:
        return -1

def main():
    migrations_dir = "/home/ubuntu/supabase/migrations"
    sql_files = glob.glob(os.path.join(migrations_dir, "*.sql"))
    sql_files.sort(key=natural_sort_key)
    
    total = len(sql_files)
    print(f"=== Found {total} migration files to apply ===")
    
    initial_tables = get_table_count()
    print(f"Initial tables count: {initial_tables}")
    
    success_count = 0
    warning_count = 0
    start_time = time.time()
    
    log_path = "/home/ubuntu/migration_results.log"
    with open(log_path, "w", encoding="utf-8") as log:
        for idx, file_path in enumerate(sql_files, 1):
            filename = os.path.basename(file_path)
            # Run using sudo -u postgres psql
            with open(file_path, "r", encoding="utf-8", errors="replace") as sql_in:
                sql_content = sql_in.read()
            
            p = subprocess.run(
                ["sudo", "-u", "postgres", "psql", "-d", "taskme_rms"],
                input=sql_content,
                capture_output=True,
                text=True
            )
            
            err = p.stderr.strip()
            out = p.stdout.strip()
            
            has_error = "ERROR:" in err
            if not has_error:
                success_count += 1
                status = "OK"
            else:
                warning_count += 1
                status = "WARN"
            
            log.write(f"[{idx}/{total}] [{status}] {filename}\n")
            if out:
                log.write(f"STDOUT:\n{out}\n")
            if err:
                log.write(f"STDERR:\n{err}\n")
            log.write("-" * 60 + "\n")
            log.flush()
            
            if idx % 15 == 0 or idx == total or status == "WARN":
                print(f"[{idx:3d}/{total}] {status:4s} {filename}")
                if has_error:
                    first_err = [line for line in err.splitlines() if "ERROR:" in line][:1]
                    if first_err:
                        print(f"       -> {first_err[0]}")
    
    elapsed = time.time() - start_time
    final_tables = get_table_count()
    print("=" * 60)
    print(f"Migration completed in {elapsed:.2f}s")
    print(f"Total files: {total} | Success: {success_count} | Files with warnings/errors: {warning_count}")
    print(f"Final tables count: {final_tables} (added {final_tables - initial_tables} tables)")
    print(f"Detailed log written to: {log_path}")

if __name__ == "__main__":
    main()
