import ExpenseForm from './ExpenseForm'

export default function LancarGasto({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  return (
    <div>
      <h1 className="title">Lançar gasto</h1>
      <p className="muted">Quanto foi, para quem e em que categoria.</p>
      <div className="stitch" />
      <div className="card">
        <ExpenseForm companyId={companyId} onDone={onSaved} />
      </div>
    </div>
  )
}
