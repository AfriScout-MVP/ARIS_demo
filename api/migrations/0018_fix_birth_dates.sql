-- ARIS — repair birth dates written by the first demo seed.
--
-- The seed generator picked the day with a signed shift, so about 40% of officials got a negative day
-- ("1987-08--19") and a few got day 00. Those rows showed an "Invalid Date" and no age. This keeps the year
-- and month and turns the day into a valid one (its absolute value, clamped to 1-28). Rows that are already
-- valid dates are untouched, so it is safe on a database that never had the problem.

UPDATE officials
   SET birth_date = substr(birth_date, 1, 8) || printf('%02d', MIN(28, MAX(1, ABS(CAST(substr(birth_date, 9) AS INTEGER)))))
 WHERE birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-*'
   AND (birth_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR birth_date LIKE '%-00');
