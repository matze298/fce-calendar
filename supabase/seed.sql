-- 8. Seed Data: 50 realistic German members
INSERT INTO members (name, email, seniority_level, availability, historical_shifts, is_approved) VALUES
('Max Mustermann', 'max.mustermann@example.com', 'Senior', 'Any', 12, true),
('Sabine Schmidt', 'sabine.schmidt@example.com', 'Standard', 'Weekends', 5, true),
('Thomas Müller', 'thomas.mueller@example.com', 'Senior', 'Weekdays', 8, true),
('Anna Fischer', 'anna.fischer@example.com', 'Junior', 'Any', 0, true),
('Lukas Weber', 'lukas.weber@example.com', 'Standard', 'Weekends', 4, true),
('Petra Wagner', 'petra.wagner@example.com', 'Senior', 'Any', 15, true),
('Stefan Becker', 'stefan.becker@example.com', 'Junior', 'Weekdays', 2, true),
('Julia Hoffmann', 'julia.hoffmann@example.com', 'Standard', 'Any', 7, true),
('Andreas Schulz', 'andreas.schulz@example.com', 'Senior', 'Weekends', 10, true),
('Kathrin Koch', 'kathrin.koch@example.com', 'Junior', 'Any', 1, true),
('Michael Bauer', 'michael.bauer@example.com', 'Senior', 'Weekdays', 9, true),
('Susanne Richter', 'susanne.richter@example.com', 'Standard', 'Weekends', 3, true),
('Daniel Klein', 'daniel.klein@example.com', 'Junior', 'Weekdays', 0, true),
('Monika Wolf', 'monika.wolf@example.com', 'Senior', 'Any', 11, true),
('Christian Schröder', 'christian.schroeder@example.com', 'Standard', 'Any', 6, true),
('Sandra Neumann', 'sandra.neumann@example.com', 'Junior', 'Weekends', 2, true),
('Frank Schwarz', 'frank.schwarz@example.com', 'Senior', 'Weekdays', 14, true),
('Gabriele Zimmermann', 'gabriele.zimmermann@example.com', 'Standard', 'Any', 5, true),
('Markus Braun', 'markus.braun@example.com', 'Junior', 'Weekdays', 1, true),
('Bettina Krüger', 'bettina.krueger@example.com', 'Senior', 'Weekends', 13, true),
('Holger Hofmann', 'holger.hofmann@example.com', 'Standard', 'Any', 4, true),
('Carsten Hartmann', 'carsten.hartmann@example.com', 'Junior', 'Weekdays', 0, true),
('Marion Lange', 'marion.lange@example.com', 'Senior', 'Weekends', 16, true),
('Uwe Schmitz', 'uwe.schmitz@example.com', 'Standard', 'Any', 8, true),
('Claudia Krause', 'claudia.krause@example.com', 'Junior', 'Weekends', 1, true),
('Jürgen Meier', 'juergen.meier@example.com', 'Senior', 'Weekdays', 12, true),
('Renate Werner', 'renate.werner@example.com', 'Standard', 'Any', 7, true),
('Klaus Vogel', 'klaus.vogel@example.com', 'Junior', 'Weekdays', 0, true),
('Ingrid Hubert', 'ingrid.hubert@example.com', 'Senior', 'Weekends', 9, true),
('Gerd Maier', 'gerd.maier@example.com', 'Standard', 'Any', 4, true),
('Inge Jung', 'inge.jung@example.com', 'Junior', 'Weekends', 2, true),
('Wolfgang Frank', 'wolfgang.frank@example.com', 'Senior', 'Weekdays', 11, true),
('Ute Berger', 'ute.berger@example.com', 'Standard', 'Any', 6, true),
('Bernd Bergmann', 'bernd.bergmann@example.com', 'Junior', 'Weekdays', 1, true),
('Helga Keller', 'helga.keller@example.com', 'Senior', 'Weekends', 14, true),
('Dieter Roth', 'dieter.roth@example.com', 'Standard', 'Any', 5, true),
('Karin Beck', 'karin.beck@example.com', 'Junior', 'Weekends', 0, true),
('Horst Lorenz', 'horst.lorenz@example.com', 'Senior', 'Weekdays', 10, true),
('Ursula Baumann', 'ursula.baumann@example.com', 'Standard', 'Any', 3, true),
('Matthias Franke', 'matthias.franke@example.com', 'Junior', 'Weekdays', 1, true),
('Hannelore Albrecht', 'hannelore.albrecht@example.com', 'Senior', 'Weekends', 13, true),
('Norbert Simon', 'norbert.simon@example.com', 'Standard', 'Any', 4, true),
('Gerhard Ludwig', 'gerhard.ludwig@example.com', 'Junior', 'Weekdays', 0, true),
('Erika Böhm', 'erika.boehm@example.com', 'Senior', 'Weekends', 15, true),
('Rainer Jäger', 'rainer.jaeger@example.com', 'Standard', 'Any', 6, true),
('Margarete Otto', 'margarete.otto@example.com', 'Junior', 'Weekends', 1, true),
('Werner Gross', 'werner.gross@example.com', 'Senior', 'Weekdays', 11, true),
('Christa Graf', 'christa.graf@example.com', 'Standard', 'Any', 5, true),
('Manfred Haas', 'manfred.haas@example.com', 'Junior', 'Weekdays', 0, true),
('Hildegard Schreiber', 'hilde.schreiber@example.com', 'Senior', 'Weekends', 12, true)
ON CONFLICT (email) DO NOTHING;

-- Add the default Admin
INSERT INTO members (name, email, is_approved, is_admin)
VALUES ('Admin', 'dev@localhost.test', true, true)
ON CONFLICT (email) DO UPDATE SET is_approved = true, is_admin = true;

-- Seed Settings
INSERT INTO settings (id, cooldown_days) VALUES (1, 21)
ON CONFLICT (id) DO NOTHING;

-- 9. Seed Data: 6 months of WorkDates (May 2026 - Oct 2026)
-- Logic: Fri, Sat, Sun always open.
-- Tue, Wed open every 3 weeks (starting May 5th, 2026).
INSERT INTO work_dates (date, start_time, required_people, is_important_shift, is_weekend)
SELECT
  d::date,
  CASE
    WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN TIME '15:30' -- Sat, Sun start in the afternoon
    ELSE TIME '20:00'
  END,
  CASE
    WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN 2 -- Sat, Sun need 2 people
    ELSE 1 -- Fri, Tue, Wed need 1 person
  END,
  CASE
    WHEN EXTRACT(DOW FROM d) = 6 AND random() > 0.8 THEN true
    ELSE false
  END,
  CASE
    WHEN EXTRACT(DOW FROM d) IN (0, 5, 6) THEN true
    ELSE false
  END
FROM generate_series('2026-05-01'::date, '2026-10-31'::date, '1 day'::interval) d
WHERE
  EXTRACT(DOW FROM d) IN (0, 5, 6) -- Fri (5), Sat (6), Sun (0)
  OR (
    -- Tuesday (2) or Wednesday (3) every 3 weeks (21 days)
    -- Starting from 2026-05-05 (Tuesday) and 2026-05-06 (Wednesday)
    EXTRACT(DOW FROM d) IN (2, 3)
    AND ( (d::date - '2026-05-05'::date) % 21 < 2 )
  )
ON CONFLICT (date, bereich) DO NOTHING;
