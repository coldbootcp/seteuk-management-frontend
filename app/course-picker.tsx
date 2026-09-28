"use client";

import { useEffect, useRef, useState } from "react";
import {
  commonSubjects,
  getCurrentCourses,
  saveCurrentCourses,
  searchSubjects,
  type CatalogSubject,
  type Curriculum,
  type CurrentCourseInput,
  type CurrentCourses,
} from "../lib/subjects-api";

/* ──────────────────────────────────────────────
   SubjectSearchField — 과목을 "고르는" 입력칸
   ────────────────────────────────────────────── */

/**
 * 과목 검색 입력칸. 글자를 치면 백엔드 카탈로그에서 후보가 뜨고, 후보를 눌러야만 과목이
 * 정해진다(자유 입력 불가). 목록에 없는 학교 자체 과목만 "기타"로 이름을 직접 적는다.
 * 온보딩·상담 화면의 수강 과목 등록과 시간표 과목 추가가 같은 칸을 쓴다.
 */
export function SubjectSearchField({
  curriculum,
  onPickSubject,
  onPickCustom,
  excludeCodes = [],
  placeholder = "과목명을 입력하세요 (예: 수, 물리, 확통)",
  autoFocus = false,
}: {
  curriculum?: Curriculum;
  onPickSubject: (subject: CatalogSubject) => void;
  onPickCustom: (name: string) => void;
  /** 이미 고른 과목 — 후보에서 흐리게 표시하고 다시 고를 수 없게 한다. */
  excludeCodes?: string[];
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogSubject[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    // 글자를 칠 때마다 요청하지 않도록 잠깐 기다리고, 늦게 도착한 옛 응답은 버린다.
    const requestId = ++requestRef.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchSubjects(q, curriculum)
        .then((response) => {
          if (requestId !== requestRef.current) return;
          setResults(response.items);
          setHighlight(0);
          setError("");
        })
        .catch((caught) => {
          if (requestId !== requestRef.current) return;
          setError(caught instanceof Error ? caught.message : "과목을 찾지 못했습니다.");
        })
        .finally(() => {
          if (requestId === requestRef.current) setSearching(false);
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, curriculum]);

  const selectable = results.filter((subject) => !excludeCodes.includes(subject.code));

  function pick(subject: CatalogSubject) {
    if (excludeCodes.includes(subject.code)) return;
    onPickSubject(subject);
    setQuery("");
    setResults([]);
  }

  function submitCustom() {
    const name = customName.trim();
    if (!name) return;
    onPickCustom(name.slice(0, 100));
    setCustomName("");
    setCustomOpen(false);
    setQuery("");
  }

  const showNoResult = !!query.trim() && !searching && results.length === 0 && !error;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          aria-label="과목 검색"
          autoComplete="off"
          autoFocus={autoFocus}
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-500 focus:outline-none bg-gray-50/50 focus:bg-white transition"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, Math.max(selectable.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              // 엔터는 "후보를 고르는" 동작일 뿐 — 후보가 없으면 아무것도 추가하지 않는다.
              e.preventDefault();
              const target = selectable[highlight];
              if (target) pick(target);
            } else if (e.key === "Escape") {
              setQuery("");
            }
          }}
          placeholder={placeholder}
          value={query}
        />
        {!!query.trim() && (results.length > 0 || searching) && (
          <ul
            className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1"
            role="listbox"
          >
            {searching && results.length === 0 && (
              <li className="px-3.5 py-2 text-[11px] text-gray-400">찾는 중…</li>
            )}
            {results.map((subject) => {
              const taken = excludeCodes.includes(subject.code);
              const active = !taken && selectable[highlight]?.code === subject.code;
              return (
                <li key={subject.code}>
                  <button
                    aria-selected={active}
                    className={`w-full text-left px-3.5 py-2 flex items-center justify-between gap-2 text-xs transition ${
                      taken
                        ? "text-gray-300 cursor-not-allowed"
                        : active
                        ? "bg-blue-50 text-brand-800"
                        : "text-gray-800 hover:bg-gray-50"
                    }`}
                    disabled={taken}
                    onClick={() => pick(subject)}
                    onMouseDown={(e) => e.preventDefault()}
                    role="option"
                    type="button"
                  >
                    <span className="font-semibold truncate">{subject.name}</span>
                    <span className="text-[10px] text-gray-400 flex-none">
                      {taken ? "추가됨" : `${subject.group} · ${subject.track ?? subject.category}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}

      {showNoResult && !customOpen && (
        <p className="text-[11px] text-gray-500">
          &lsquo;{query.trim()}&rsquo;에 맞는 과목이 목록에 없어요. 줄임말 대신 과목명 일부로 찾아보거나,
          학교가 따로 개설한 과목이면 아래 &lsquo;기타&rsquo;로 입력해 주세요.
        </p>
      )}

      {customOpen ? (
        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 space-y-2">
          <p className="text-[11px] text-amber-900 leading-relaxed">
            목록에 없는 <strong>학교 자체 과목</strong>(학교지정과목·공동교육과정 등)만 직접 입력해 주세요.
            목록에 있는 과목은 검색해서 골라야 과목 정보와 연결돼요.
          </p>
          <div className="flex items-center gap-2">
            <input
              aria-label="기타 과목명"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-amber-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300/40"
              maxLength={100}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitCustom();
                }
              }}
              placeholder="예: 우리 지역 탐구"
              value={customName}
            />
            <button
              className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold transition"
              disabled={!customName.trim()}
              onClick={submitCustom}
              type="button"
            >
              기타로 추가
            </button>
            <button
              className="px-2 py-2 text-[11px] font-bold text-gray-500 hover:text-gray-800"
              onClick={() => setCustomOpen(false)}
              type="button"
            >
              닫기
            </button>
          </div>
        </div>
      ) : (
        <button
          className="text-[11px] font-bold text-gray-400 hover:text-amber-700 transition"
          onClick={() => setCustomOpen(true)}
          type="button"
        >
          목록에 없는 과목인가요? 기타로 직접 입력
        </button>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   CurrentCoursePicker — 이번 학기 수강 과목 등록
   ────────────────────────────────────────────── */

type PickedCourse = {
  key: string;
  name: string;
  code: string | null;
  meta: string;
  locked: boolean;
};

function pickedFromCurrent(current: CurrentCourses): PickedCourse[] {
  return current.courses.map((course) => ({
    key: course.subject_code ?? `custom:${course.subject}`,
    name: course.subject,
    code: course.subject_code,
    meta: course.is_custom ? "기타" : course.category,
    locked: course.locked,
  }));
}

/**
 * 이번 학기 수강 과목을 고르는 화면. 온보딩의 한 걸음이자, 상담 화면에서 나중에
 * 등록·수정할 때 쓰는 모달 본문이다. 필수는 아니지만(개학 전이라 모를 수 있다)
 * 건너뛰려면 한 번 더 확인을 받는다 — 과목이 있어야 상담이 이번 학기 주제를 과목과
 * 연결해 추천할 수 있기 때문이다.
 */
export function CurrentCoursePicker({
  submitLabel,
  onSaved,
  onSkip,
  onBack,
}: {
  submitLabel: string;
  onSaved: (current: CurrentCourses) => void;
  /** 주면 "아직 시간표를 몰라요"로 건너뛸 수 있다(온보딩). */
  onSkip?: () => void;
  onBack?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState<{ grade: number; semester: number; curriculum: Curriculum } | null>(null);
  const [picked, setPicked] = useState<PickedCourse[]>([]);
  const [examples, setExamples] = useState<CatalogSubject[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await getCurrentCourses();
        if (cancelled) return;
        setPeriod({ grade: current.grade, semester: current.semester, curriculum: current.curriculum });
        setPicked(pickedFromCurrent(current));
        const common = await commonSubjects(current.grade, current.semester, current.curriculum);
        if (!cancelled) setExamples(common.items);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "수강 과목을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickedCodes = picked.map((course) => course.code).filter((code): code is string => !!code);

  function addSubject(subject: CatalogSubject) {
    setPicked((prev) =>
      prev.some((course) => course.code === subject.code)
        ? prev
        : [
            ...prev,
            {
              key: subject.code,
              name: subject.name,
              code: subject.code,
              meta: subject.track ?? subject.category,
              locked: false,
            },
          ],
    );
    setConfirmSkip(false);
  }

  function addCustom(name: string) {
    const key = `custom:${name}`;
    setPicked((prev) =>
      prev.some((course) => course.key === key)
        ? prev
        : [...prev, { key, name, code: null, meta: "기타", locked: false }],
    );
    setConfirmSkip(false);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const payload: CurrentCourseInput[] = picked
        .filter((course) => !course.locked)
        .map((course) => (course.code ? { subject_code: course.code } : { custom_name: course.name }));
      const saved = await saveCurrentCourses(payload);
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "수강 과목을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <p className="text-xs text-gray-400 py-6 text-center">이번 학기 정보를 불러오는 중…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-sm font-extrabold text-gray-900">
          {period ? `${period.grade}학년 ${period.semester}학기에 ` : "이번 학기에 "}듣는 과목을 모두 골라 주세요
        </h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          이번 학기 목표와 탐구 주제를 이 과목들과 연결해 추천해요. 확정된 과목은 빠짐없이 넣어 주세요(보통
          7~10과목). 요일·교시는 나중에 시간표 탭에서 정해도 돼요.
          {period && (
            <span className="ml-1 text-gray-400">({period.curriculum} 개정 교육과정 과목 목록)</span>
          )}
        </p>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <SubjectSearchField
        autoFocus
        curriculum={period?.curriculum}
        excludeCodes={pickedCodes}
        onPickCustom={addCustom}
        onPickSubject={addSubject}
      />

      {examples.length > 0 && (
        <div className="space-y-2">
          <span className="block text-[11px] font-bold text-gray-500">
            {period ? `${period.grade}학년 ${period.semester}학기에 흔히 듣는 과목` : "흔히 듣는 과목"} · 눌러서 추가
          </span>
          <div className="flex flex-wrap gap-1.5">
            {examples.map((subject) => {
              const added = pickedCodes.includes(subject.code);
              return (
                <button
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                    added
                      ? "border-brand-200 bg-brand-50 text-brand-400 cursor-default"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:border-brand-300 hover:bg-brand-50"
                  }`}
                  disabled={added}
                  key={subject.code}
                  onClick={() => addSubject(subject)}
                  type="button"
                >
                  {added ? "✓ " : "+ "}
                  {subject.name}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400">학교마다 개설 과목이 달라요. 실제로 듣는 과목만 고르세요.</p>
        </div>
      )}

      <div className="space-y-2">
        <span className="block text-[11px] font-bold text-gray-700">
          고른 과목 <span className="text-brand-600">{picked.length}</span>개
        </span>
        {picked.length === 0 ? (
          <p className="text-[11px] text-gray-400 p-3 rounded-xl border border-dashed border-gray-200 text-center">
            아직 고른 과목이 없어요. 위에서 검색하거나 예시를 눌러 추가하세요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((course) => (
              <span
                className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border text-xs font-semibold ${
                  course.code
                    ? "bg-white border-gray-200 text-gray-800"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
                key={course.key}
              >
                <span>{course.name}</span>
                <span className="text-[10px] font-medium text-gray-400">{course.meta}</span>
                {course.locked ? (
                  <span className="text-[10px] font-bold text-gray-400" title="성적이 입력된 과목은 성적 탭에서 관리해요">
                    성적 있음
                  </span>
                ) : (
                  <button
                    aria-label={`${course.name} 빼기`}
                    className="w-4 h-4 rounded flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setPicked((prev) => prev.filter((item) => item.key !== course.key))}
                    type="button"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {confirmSkip && onSkip && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 space-y-3">
          <p className="text-xs text-amber-900 leading-relaxed">
            개학 전이라 아직 모르면 넘어가도 괜찮아요. 다만 과목을 모르면 상담에서 이번 학기 주제를 과목과
            연결해 추천하기 어려워요. 과목이 정해지면 상담 화면의 <strong>이번 학기 수강 과목</strong>에서 바로
            등록할 수 있어요.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="px-3.5 py-2 rounded-lg border border-amber-300 bg-white text-amber-900 text-xs font-bold hover:bg-amber-50"
              onClick={() => setConfirmSkip(false)}
              type="button"
            >
              과목 고르러 가기
            </button>
            <button
              className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
              onClick={onSkip}
              type="button"
            >
              그래도 넘어가기
            </button>
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold transition"
              onClick={onBack}
              type="button"
            >
              ← 이전으로
            </button>
          )}
          {onSkip && picked.length === 0 && !confirmSkip && (
            <button
              className="px-3 py-2.5 text-xs font-bold text-gray-400 hover:text-gray-700 transition"
              onClick={() => setConfirmSkip(true)}
              type="button"
            >
              아직 시간표를 몰라요
            </button>
          )}
        </div>
        <button
          className="px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs shadow-xs transition"
          disabled={saving || picked.length === 0}
          onClick={() => void save()}
          type="button"
        >
          {saving ? "저장하는 중…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
