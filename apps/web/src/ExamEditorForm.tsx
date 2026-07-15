import { useState } from "react";
import type { FormEvent } from "react";
import { Save } from "lucide-react";
import type { CreateExamInput } from "@dcvp/shared";
import { Toggle } from "./components";

type ExamEditorFormProps = {
  readonly initialExam: CreateExamInput;
  readonly isPending: boolean;
  readonly submitLabel: string;
  readonly onSubmit: (input: CreateExamInput) => void;
};

export function ExamEditorForm({ initialExam, isPending, submitLabel, onSubmit }: ExamEditorFormProps) {
  const [form, setForm] = useState<CreateExamInput>(initialExam);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      ...form,
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      languages: form.languages.length ? form.languages : ["Python"]
    });
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <div className="section-title">
        <div>
          <h2>{submitLabel}</h2>
          <p>시험 일정, 응시 시간, 지원 언어와 감독 정책을 설정합니다.</p>
        </div>
      </div>
      <label>
        시험명
        <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
      </label>
      <label>
        설명
        <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
      </label>
      <div className="grid-2">
        <label>
          시작 일시
          <input type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} required />
        </label>
        <label>
          종료 일시
          <input type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} required />
        </label>
      </div>
      <div className="grid-2">
        <label>
          제한 시간(분)
          <input type="number" min={10} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} required />
        </label>
        <label>
          언어
          <input value={form.languages.join(", ")} onChange={(event) => setForm({ ...form, languages: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} required />
        </label>
      </div>
      <div className="toggle-grid">
        <Toggle label="감독 기능" checked={form.proctoringEnabled} onChange={(value) => setForm({ ...form, proctoringEnabled: value })} />
        <Toggle label="신분 확인" checked={form.identityVerificationEnabled} onChange={(value) => setForm({ ...form, identityVerificationEnabled: value })} />
        <Toggle label="모바일 카메라 필수" checked={form.mobileCameraRequired} onChange={(value) => setForm({ ...form, mobileCameraRequired: value })} />
        <Toggle label="화면 공유 필수" checked={form.screenShareRequired} onChange={(value) => setForm({ ...form, screenShareRequired: value })} />
      </div>
      <button className="primary-action" type="submit" disabled={isPending}>
        <Save size={18} />{submitLabel}
      </button>
    </form>
  );
}
