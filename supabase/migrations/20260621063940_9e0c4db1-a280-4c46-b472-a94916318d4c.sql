
ALTER TABLE public.intel_records
  ADD COLUMN IF NOT EXISTS intel_type text NOT NULL DEFAULT 'SIGINT',
  ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'CONFIDENTIAL',
  ADD COLUMN IF NOT EXISTS report_number text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS key_findings text,
  ADD COLUMN IF NOT EXISTS analyst_remarks text;

INSERT INTO public.units (code, name, description) VALUES
  ('GATE-A','GATE Alpha','Primary tracking station — North Sector'),
  ('GATE-B','GATE Bravo','Forward listening post — East Ridge'),
  ('GATE-C','GATE Charlie','Mobile collection unit — Convoy 3'),
  ('GATE-D','GATE Delta','Strategic analysis hub — HQ Bunker'),
  ('GATE-E','GATE Echo','Mountain relay — Peak 4'),
  ('GATE-F','GATE Foxtrot','Naval signals platform — SS Vigilant'),
  ('GATE-G','GATE Golf','Desert array — Site G7'),
  ('GATE-H','GATE Hotel','Backup operations centre — South Wing')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.satellites (name, orbital_position, launch_date, transponder_count, frequency_bands, notes) VALUES
  ('INTELSAT 20',     68.5,  '2012-08-02', 54, ARRAY['C','Ku','Ka'], 'High-throughput IOR coverage'),
  ('EUTELSAT 7B',      7.0,  '2013-05-15', 70, ARRAY['Ku'],          'Europe/MENA broadcast'),
  ('HISPASAT 30W-6', 329.0,  '2018-03-06', 48, ARRAY['C','Ku','Ka'], 'Americas + Europe'),
  ('SES-9',          108.2,  '2016-03-04', 81, ARRAY['Ku'],          'APAC coverage'),
  ('ASIASAT 9',      122.0,  '2017-09-28', 28, ARRAY['C','Ku'],      'Asia-Pacific'),
  ('ARABSAT-6A',      30.5,  '2019-04-11', 80, ARRAY['Ku','Ka'],     'MENA HTS'),
  ('YAHSAT 1B',       47.5,  '2012-04-23', 47, ARRAY['Ku','Ka'],     'MidEast / SW Asia'),
  ('THAICOM 6',       78.5,  '2014-01-06', 32, ARRAY['C','Ku'],      'SE Asia broadcast'),
  ('GSAT-30',         83.0,  '2020-01-17', 28, ARRAY['C','Ku'],      'India/ROI coverage'),
  ('NSS-12',          57.0,  '2009-10-29', 88, ARRAY['C','Ku'],      'Africa / MidEast'),
  ('TURKSAT 4A',      42.0,  '2014-02-14', 42, ARRAY['Ku','Ka'],     'TR / Central Asia'),
  ('JCSAT-17',       136.0,  '2020-02-18', 32, ARRAY['C','Ku','S'],  'Mobile comms JP')
ON CONFLICT DO NOTHING;

INSERT INTO public.beams (satellite_id, name, band, beam_type, notes)
SELECT s.id, b.name, b.band, b.beam_type, NULL
FROM public.satellites s
CROSS JOIN LATERAL (VALUES
  ('Global C',        'C',  'Global'),
  ('Wide Ku',         'Ku', 'Wide'),
  ('Spot Ka-1',       'Ka', 'Spot'),
  ('Steerable Ku-S',  'Ku', 'Steerable')
) AS b(name, band, beam_type)
WHERE NOT EXISTS (SELECT 1 FROM public.beams);

INSERT INTO public.unit_beam_visibility (unit_id, beam_id, visible, notes)
SELECT u.id, b.id,
       (mod(abs(hashtext(u.code || b.id::text)), 10) < 7),
       NULL
FROM public.units u
CROSS JOIN public.beams b
WHERE NOT EXISTS (SELECT 1 FROM public.unit_beam_visibility);

INSERT INTO public.equipment (unit_id, category_id, name, make, model, serial_number, date_of_procurement, specifications, serviceability, remarks)
SELECT u.id,
       c.id,
       c.name || ' / ' || u.code || '-' || lpad(gs::text,2,'0'),
       (ARRAY['Hughes','ViaSat','Comtech','Newtec','Kratos','Thales'])[1 + mod(gs + length(u.code),6)],
       'M' || (1000 + mod(abs(hashtext(u.code||c.name||gs::text)),9000))::text,
       'SN-' || upper(substring(md5(u.code||c.name||gs::text),1,8)),
       (current_date - ((mod(abs(hashtext(u.code||c.name)),1200))::text || ' days')::interval)::date,
       'Std issue ' || c.name,
       (CASE mod(abs(hashtext(u.code||c.name||gs::text)), 10)
         WHEN 0 THEN 'Non-Serviceable'
         WHEN 1 THEN 'Under Repair'
         WHEN 2 THEN 'Partially Serviceable'
         ELSE        'Operational'
       END)::public.serviceability_status,
       NULL
FROM public.units u
CROSS JOIN public.equipment_categories c
CROSS JOIN generate_series(1,2) gs
WHERE NOT EXISTS (SELECT 1 FROM public.equipment);

INSERT INTO public.fault_details (equipment_id, date_raised, category, description, estimated_restoration, maintenance_remarks, resolved)
SELECT e.id,
       (current_date - ((mod(abs(hashtext(e.id::text)),60))::text || ' days')::interval)::date,
       (ARRAY['Electrical','RF Chain','Software','Cooling','Mechanical'])[1 + mod(abs(hashtext(e.id::text)),5)],
       'Detected ' || e.serviceability::text || ' state during diagnostics; awaiting parts and engineer slot.',
       (current_date + ((mod(abs(hashtext(e.id::text)),20)+3)::text || ' days')::interval)::date,
       'Coordinating with depot; spares ETA confirmed.',
       false
FROM public.equipment e
WHERE e.serviceability::text <> 'Operational'
  AND NOT EXISTS (SELECT 1 FROM public.fault_details);

INSERT INTO public.engagements (unit_id, satellite_id, status, observation_start, remarks)
SELECT u.id,
       s.id,
       (ARRAY['Planned','In Progress','Completed','Paused','In Progress','In Progress']::engagement_status[])[1 + mod(abs(hashtext(u.code||s.name)),6)],
       (now() - ((mod(abs(hashtext(u.code||s.name)),72))::text || ' hours')::interval),
       'Routine collection cycle.'
FROM public.units u
CROSS JOIN LATERAL (
  SELECT id, name FROM public.satellites
  ORDER BY mod(abs(hashtext(u.code||id::text)), 100)
  LIMIT 3
) s
WHERE NOT EXISTS (SELECT 1 FROM public.engagements);

INSERT INTO public.intel_records
  (unit_id, satellite_id, observation_date, frequency, band, summary, analysis_report,
   is_productive, activity_level, intel_type, classification, report_number, source, key_findings, analyst_remarks)
SELECT u.id,
       s.id,
       (current_date - ((mod(abs(hashtext(u.code||t.t||n::text)),90))::text || ' days')::interval)::date,
       (3600 + mod(abs(hashtext(u.code||t.t||n::text)),8000))::text || ' MHz',
       (ARRAY['C','Ku','Ka','S','L'])[1 + mod(abs(hashtext(u.code||t.t||n::text)),5)],
       t.t || ' acquisition over ' || s.name || '; carrier behaviour consistent with prior tasking.',
       'Detailed waveform analysis indicates continued ' || lower(t.t) || ' activity. Modulation parameters logged. Bandwidth occupancy within nominal envelope.',
       (mod(abs(hashtext(u.code||t.t||n::text)),3) <> 0),
       (ARRAY['Low','Moderate','High','Sustained'])[1 + mod(abs(hashtext(u.code||t.t||n::text)),4)],
       t.t,
       (ARRAY['UNCLASSIFIED','CONFIDENTIAL','SECRET','TOP SECRET'])[1 + mod(abs(hashtext(u.code||t.t||n::text)),4)],
       t.t || '-' || u.code || '-' || lpad(n::text, 3, '0'),
       (ARRAY['Direct intercept','Cooperative liaison','Open broadcast','Telemetry capture','Field operator'])[1 + mod(abs(hashtext(u.code||t.t||n::text)),5)],
       '• Persistent carrier on observed frequency.' || E'\n' ||
       '• Burst pattern repeats at ~' || (5+mod(abs(hashtext(t.t||u.code)),40))::text || ' min intervals.' || E'\n' ||
       '• Cross-bearing matches prior fix within ±' || (1+mod(abs(hashtext(s.name||t.t)),5))::text || '°.' || E'\n' ||
       '• Operator handle and call-sign cadence unchanged.',
       'Recommend continued passive monitoring; escalate to ' || t.t || ' cell if modulation switches.'
FROM public.units u
CROSS JOIN (VALUES ('SIGINT'),('COMINT'),('ELINT'),('OSINT'),('TECHINT')) AS t(t)
CROSS JOIN generate_series(1,3) n
CROSS JOIN LATERAL (
  SELECT id, name FROM public.satellites
  ORDER BY mod(abs(hashtext(u.code||t.t||n::text||id::text)), 100)
  LIMIT 1
) s
WHERE NOT EXISTS (SELECT 1 FROM public.intel_records);
