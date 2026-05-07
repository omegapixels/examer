-- =============================================
-- EXAM SYSTEM - SUPABASE SCHEMA
-- Run this in your Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- EXAMS TABLE
CREATE TABLE IF NOT EXISTS exams (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  pass_score INTEGER DEFAULT 50, -- percentage to pass
  time_limit INTEGER DEFAULT NULL, -- minutes, NULL = no limit
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- QUESTIONS TABLE
CREATE TABLE IF NOT EXISTS questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  points INTEGER DEFAULT 1,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ANSWERS TABLE (options for each question)
CREATE TABLE IF NOT EXISTS answers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- EXAM SESSIONS TABLE (student taking an exam)
CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  score INTEGER DEFAULT 0, -- actual points earned
  total_points INTEGER DEFAULT 0, -- max possible points
  percentage NUMERIC(5,2) DEFAULT 0,
  passed BOOLEAN DEFAULT false,
  time_taken INTEGER DEFAULT NULL -- seconds
);

-- STUDENT ANSWERS TABLE
CREATE TABLE IF NOT EXISTS student_answers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  answer_id UUID REFERENCES answers(id) ON DELETE SET NULL,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exam_id ON exam_sessions(exam_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_session_id ON student_answers(session_id);

-- ROW LEVEL SECURITY (RLS) - Allow public access for this app
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_answers ENABLE ROW LEVEL SECURITY;

-- POLICIES - Allow all operations (adjust for production)
CREATE POLICY "Allow all on exams" ON exams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on questions" ON questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on answers" ON answers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on exam_sessions" ON exam_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on student_answers" ON student_answers FOR ALL USING (true) WITH CHECK (true);
