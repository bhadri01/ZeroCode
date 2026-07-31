-- Report compile cost separately from execution cost.
--
-- `cpu_time` used to be the whole job's cgroup CPU: for a compiled language it
-- bundled the compiler's work into the number clients read as the program's
-- execution time. For C++ that meant a ~1.5 s header parse showed up as
-- "execution time", which is not comparable to what other judges report and
-- made the engine look far slower than it runs.
--
-- The worker now bills the two phases separately at the compile->run barrier:
--   cpu_time     CPU of the RUN phase only  (the submitted program)
--   compile_time wall-clock of the COMPILE phase, NULL/0 when there wasn't one
--                (interpreted languages, and compile-cache hits)
--   wall_time    unchanged: the whole submission, compile included
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS compile_time REAL;

COMMENT ON COLUMN submissions.compile_time IS
    'Wall-clock seconds spent in the compile phase; NULL for interpreted languages and compile-cache hits.';
