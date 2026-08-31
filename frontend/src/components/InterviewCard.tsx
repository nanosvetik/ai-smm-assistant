import type { Questionnaire } from "../lib/api";
import "./InterviewCard.css";

interface InterviewCardProps {
  values: Questionnaire;
  onChange: (patch: Partial<Questionnaire>) => void;
}

const QUESTIONS: {
  key: keyof Questionnaire;
  question: string;
  placeholder: string;
  optional?: boolean;
}[] = [
  {
    key: "clientDescription",
    question: "Кто ваш клиент? Не как в резюме, а по-человечески — кто эти люди и с чем они к вам приходят.",
    placeholder: "Например: женщины 30–45 лет, которые устали откладывать себя на потом...",
  },
  {
    key: "clientPhrases",
    question: "Что клиенты говорят вам своими словами — до, во время или после работы с вами?",
    placeholder: "Если вспомните дословные фразы — приведите здесь. Можно пропустить.",
    optional: true,
  },
  {
    key: "expertPath",
    question:
      "Как вы начали своё дело? Учились специально, набили руку на практике, или увлечение просто переросло во что-то большее — не важно, какой из вариантов ваш.",
    placeholder: "Например: варю мыло дома пять лет, начинала для себя, рецепты собирала методом проб и ошибок.",
  },
  {
    key: "mainPrinciple",
    question: "Как вы обычно решаете задачу клиента? Опишите свой главный принцип по шагам, если получится.",
    placeholder: "Например: сначала разбираю привычный день клиента, потом ищу...",
  },
  {
    key: "contentTaboos",
    question: "Чего вы точно не делаете и не обсуждаете в контенте?",
    placeholder: "Например: не ставлю диагнозов, не критикую других специалистов по имени...",
  },
];

export function InterviewCard({ values, onChange }: InterviewCardProps) {
  return (
    <div className="interview-card">
      {QUESTIONS.map(({ key, question, placeholder, optional }) => (
        <div className="interview-question" key={key}>
          <div className="interview-avatar" aria-hidden="true">
            „
          </div>
          <div className="interview-body">
            <p className="interview-question-text">
              {question}
              {optional && <span className="interview-optional"> Необязательно.</span>}
            </p>
            <textarea
              value={values[key] ?? ""}
              onChange={(e) => onChange({ [key]: e.target.value })}
              placeholder={placeholder}
              rows={3}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
