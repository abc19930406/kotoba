import { Rating, type Grade } from 'ts-fsrs'

interface GradeButtonsProps {
  onGrade: (grade: Grade) => void
}

const GRADE_OPTIONS: { grade: Grade; label: string; className: string }[] = [
  { grade: Rating.Again, label: '再來一次', className: 'grade-again' },
  { grade: Rating.Hard, label: '困難', className: 'grade-hard' },
  { grade: Rating.Good, label: '良好', className: 'grade-good' },
  { grade: Rating.Easy, label: '簡單', className: 'grade-easy' },
]

export function GradeButtons({ onGrade }: GradeButtonsProps) {
  return (
    <div className="grade-buttons">
      {GRADE_OPTIONS.map(({ grade, label, className }) => (
        <button key={grade} type="button" className={className} onClick={() => onGrade(grade)}>
          {label}
        </button>
      ))}
    </div>
  )
}
