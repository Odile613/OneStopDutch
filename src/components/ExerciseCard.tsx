import { useState } from "react";
import type { Exercise } from "../types";
import { markExercise } from "../lib/progress";
import { Icon } from "./Icon";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function ExerciseCard({
  exercise,
  index,
}: {
  exercise: Exercise;
  index: number;
}) {
  const [checked, setChecked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  return (
    <article className="exercise-card">
      <div className="exercise-card__meta">
        <span className="exercise-card__number">Exercise {index + 1}</span>
        <span className="exercise-card__type">
          {exercise.type === "choice"
            ? "Multiple choice"
            : exercise.type === "fill"
              ? "Fill in"
              : "Open answer"}
        </span>
      </div>
      <p className="exercise-card__instruction">
        {exercise.instruction ?? "Answer the question."}
      </p>
      <p className="exercise-card__question">{exercise.question}</p>
      <ExerciseBody
        key={attempt}
        exercise={exercise}
        checked={checked}
        setChecked={setChecked}
      />
      {checked && (
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => {
            setChecked(false);
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </button>
      )}
    </article>
  );
}

function ExerciseBody({
  exercise,
  checked,
  setChecked,
}: {
  exercise: Exercise;
  checked: boolean;
  setChecked: (value: boolean) => void;
}) {
  switch (exercise.type) {
    case "choice":
      return <ChoiceBody exercise={exercise} checked={checked} setChecked={setChecked} />;
    case "fill":
      return <FillBody exercise={exercise} checked={checked} setChecked={setChecked} />;
    case "open":
      return <OpenBody exercise={exercise} checked={checked} setChecked={setChecked} />;
  }
}

function ChoiceBody({
  exercise,
  checked,
  setChecked,
}: {
  exercise: Exercise & { type: "choice" };
  checked: boolean;
  setChecked: (value: boolean) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const correct = selected === exercise.answerIndex;

  function check() {
    markExercise(exercise.id, correct ? "correct" : "revealed");
    setChecked(true);
  }

  return (
    <div>
      <div className="choices">
        {exercise.options.map((option, index) => (
          <label
            key={`${option}-${index}`}
            className={
              checked
                ? index === exercise.answerIndex
                  ? "choice choice--correct"
                  : index === selected
                    ? "choice choice--wrong"
                    : "choice"
                : "choice"
            }
          >
            <input
              type="radio"
              name={exercise.id}
              checked={selected === index}
              disabled={checked}
              onChange={() => setSelected(index)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
      {!checked ? (
        <button
          type="button"
          className="btn btn--small"
          onClick={check}
          disabled={selected === null}
        >
          Check answer
        </button>
      ) : (
        <Feedback correct={correct} explanation={exercise.explanation} />
      )}
    </div>
  );
}

function FillBody({
  exercise,
  checked,
  setChecked,
}: {
  exercise: Exercise & { type: "fill" };
  checked: boolean;
  setChecked: (value: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [prefix, suffix] = exercise.question.split(/_{2,}/);
  const correct = exercise.accepted.some(
    (answer) => normalize(answer) === normalize(value),
  );

  function check() {
    if (!value.trim()) return;
    markExercise(exercise.id, correct ? "correct" : "revealed");
    setChecked(true);
  }

  return (
    <div>
      <p className="fill-line">
        {prefix}
        <input
          className="fill-input"
          value={value}
          disabled={checked}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") check();
          }}
          aria-label="Your answer"
          autoComplete="off"
        />
        {suffix ?? ""}
      </p>
      {!checked ? (
        <button
          type="button"
          className="btn btn--small"
          onClick={check}
          disabled={!value.trim()}
        >
          Check answer
        </button>
      ) : (
        <Feedback
          correct={correct}
          solution={exercise.solution}
          explanation={exercise.explanation}
        />
      )}
    </div>
  );
}

function OpenBody({
  exercise,
  checked,
  setChecked,
}: {
  exercise: Exercise & { type: "open" };
  checked: boolean;
  setChecked: (value: boolean) => void;
}) {
  return (
    <div>
      {!checked ? (
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            markExercise(exercise.id, "revealed");
            setChecked(true);
          }}
        >
          Show model answer
        </button>
      ) : (
        <Feedback correct solution={exercise.solution} explanation={exercise.explanation} />
      )}
    </div>
  );
}

function Feedback({
  correct,
  solution,
  explanation,
}: {
  correct: boolean;
  solution?: string;
  explanation?: string;
}) {
  return (
    <div className={correct ? "feedback feedback--correct" : "feedback feedback--wrong"}>
      <strong className="feedback__title">
        <Icon name={correct ? "check" : "close"} size={16} />
        {correct ? "Correct" : "Not quite — review the answer"}
      </strong>
      {solution && <p className="feedback__solution">{solution}</p>}
      {explanation && <p className="feedback__explanation">{explanation}</p>}
    </div>
  );
}
