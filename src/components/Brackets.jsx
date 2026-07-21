// Signature corner-bracket accents. Four small L-marks, one per corner, drawn
// with borders. Purely decorative.
export function Brackets() {
  return (
    <div className="brackets" aria-hidden="true">
      <span className="bk tl" />
      <span className="bk tr" />
      <span className="bk bl" />
      <span className="bk br" />
    </div>
  )
}
