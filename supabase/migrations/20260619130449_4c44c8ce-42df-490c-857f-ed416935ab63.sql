
-- Roles enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'operator', 'viewer');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles read all auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles read self or admin" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "user_roles admin manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Helper: can edit (admin or operator)
CREATE OR REPLACE FUNCTION public.can_edit(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'operator')
$$;

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Signup trigger: create profile + assign role (first user = admin, else viewer)
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count <= 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- UNITS
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units read" ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY "units write" ON public.units FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER units_updated BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- EQUIPMENT CATEGORIES (fixed list but stored)
CREATE TABLE public.equipment_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_categories TO authenticated;
GRANT ALL ON public.equipment_categories TO service_role;
ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat read" ON public.equipment_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "cat write" ON public.equipment_categories FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));

INSERT INTO public.equipment_categories (name, sort_order) VALUES
('Antenna', 1), ('LNA', 2), ('LNB', 3), ('Demodulators', 4), ('Processing Servers', 5), ('Other Resources', 6);

-- SERVICEABILITY enum
CREATE TYPE public.serviceability_status AS ENUM ('Operational','Partially Serviceable','Under Repair','Non-Serviceable');

-- EQUIPMENT
CREATE TABLE public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.equipment_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  photo_url TEXT,
  make TEXT,
  model TEXT,
  serial_number TEXT,
  date_of_procurement DATE,
  specifications TEXT,
  remarks TEXT,
  serviceability public.serviceability_status NOT NULL DEFAULT 'Operational',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.equipment(unit_id);
CREATE INDEX ON public.equipment(category_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment TO authenticated;
GRANT ALL ON public.equipment TO service_role;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eq read" ON public.equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "eq write" ON public.equipment FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER eq_updated BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ATTACHMENTS (polymorphic by entity_type)
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.attachments(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO authenticated;
GRANT ALL ON public.attachments TO service_role;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att read" ON public.attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "att write" ON public.attachments FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));

-- SATELLITES
CREATE TABLE public.satellites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  orbital_position NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.satellites TO authenticated;
GRANT ALL ON public.satellites TO service_role;
ALTER TABLE public.satellites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sat read" ON public.satellites FOR SELECT TO authenticated USING (true);
CREATE POLICY "sat write" ON public.satellites FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER sat_updated BEFORE UPDATE ON public.satellites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- VISIBILITY (EIRP per satellite per unit)
CREATE TABLE public.visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_id UUID NOT NULL REFERENCES public.satellites(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  eirp NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (satellite_id, unit_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visibility TO authenticated;
GRANT ALL ON public.visibility TO service_role;
ALTER TABLE public.visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vis read" ON public.visibility FOR SELECT TO authenticated USING (true);
CREATE POLICY "vis write" ON public.visibility FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER vis_updated BEFORE UPDATE ON public.visibility FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ALLOCATIONS (priority)
CREATE TYPE public.priority_level AS ENUM ('Critical','High','Medium','Low');

CREATE TABLE public.allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  satellite_id UUID NOT NULL REFERENCES public.satellites(id) ON DELETE CASCADE,
  priority public.priority_level NOT NULL DEFAULT 'Medium',
  eirp NUMERIC,
  observation_requirement TEXT,
  allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, satellite_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocations TO authenticated;
GRANT ALL ON public.allocations TO service_role;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alloc read" ON public.allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "alloc write" ON public.allocations FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER alloc_updated BEFORE UPDATE ON public.allocations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ENGAGEMENTS
CREATE TYPE public.engagement_status AS ENUM ('Planned','In Progress','Completed','Paused','Failed');

CREATE TABLE public.engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  satellite_id UUID NOT NULL REFERENCES public.satellites(id) ON DELETE CASCADE,
  antenna_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  demodulator_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  processing_server_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  observation_start TIMESTAMPTZ,
  status public.engagement_status NOT NULL DEFAULT 'Planned',
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.engagements(unit_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagements TO authenticated;
GRANT ALL ON public.engagements TO service_role;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eng read" ON public.engagements FOR SELECT TO authenticated USING (true);
CREATE POLICY "eng write" ON public.engagements FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER eng_updated BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- INT REPOSITORY
CREATE TABLE public.intel_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_id UUID REFERENCES public.satellites(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  observation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  frequency TEXT,
  band TEXT,
  summary TEXT,
  analysis_report TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.intel_records(observation_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_records TO authenticated;
GRANT ALL ON public.intel_records TO service_role;
ALTER TABLE public.intel_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "int read" ON public.intel_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "int write" ON public.intel_records FOR ALL TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE TRIGGER int_updated BEFORE UPDATE ON public.intel_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
