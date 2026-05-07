import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Exam = {
  id: string
  title: string
  description: string | null
  pass_score: number
  time_limit: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Question = {
  id: string
  exam_id: string
  question_text: string
  points: number
  order_index: number
  created_at: string
  answers?: Answer[]
}

export type Answer = {
  id: string
  question_id: string
  answer_text: string
  is_correct: boolean
  created_at: string
}

export type ExamSession = {
  id: string
  exam_id: string
  student_name: string
  started_at: string
  finished_at: string | null
  score: number
  total_points: number
  percentage: number
  passed: boolean
  time_taken: number | null
}
