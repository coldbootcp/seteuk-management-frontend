"use client";

/**
 * 캘린더 탭 — 시험 기간·수행평가 기간처럼 날짜 구간을 가진 일정을 적어 두는
 * 곳. Todo Mate류 캘린더 UI(달력 격자 + 옆 목록)를 참고했지만, 여긴 하루짜리
 * 체크리스트가 아니라 "기간"을 기록하는 용도라 날짜 구간과 과목을 받는다.
 */

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api-client";
import type { components } from "../lib/api-types";
import { Icon } from "./icons";

type CalendarEvent = components["schemas"]["CalendarEventRead"];
type CalendarEventType = components["schemas"]["CalendarEventType"];

const EVENT_TYPES: CalendarEventType[] = ["시험", "수행평가", "기타"];

const TYPE_STYLE: Record<CalendarEventType, { badge: string; text: string }> = {
  시험: { badge: "bg-rose-50 border-rose-200", text: "text-rose-700" },
  수행평가: { badge: "bg-amber-50 border-amber-200", text: "text-amber-700" },
  기타: { badge: "bg-gray-50 border-gray-200", text: "text-gray-600" },
};

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isWithin(dateIso: string, event: CalendarEvent): boolean {
  return dateIso >= event.start_date && dateIso <= event.end_date;
}

/** 월요일 시작 기준으로, 이번 달 달력에 채울 날짜 칸(앞뒤 빈 칸 포함)을 만든다. */
function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // 0=월요일이 되도록 보정
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: startOffset }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type FormState = {
  id?: string;
  event_type: CalendarEventType;
  title: string;
  subject: string;
  start_date: string;
  end_date: string;
  memo: string;
};

function emptyForm(dateIso?: string): FormState {
  return {
    event_type: "시험",
    title: "",
    subject: "",
    start_date: dateIso ?? toIsoDate(new Date()),
    end_date: dateIso ?? toIsoDate(new Date()),
    memo: "",
  };
}

function formFromEvent(event: CalendarEvent): FormState {
  return {
    id: event.id,
    event_type: event.event_type,
    title: event.title,
    subject: event.subject ?? "",
    start_date: event.start_date,
    end_date: event.end_date,
    memo: event.memo ?? "",
  };
}

export function CalendarView() {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  const todayIso = toIsoDate(today);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ items: CalendarEvent[]; total: number }>(
        "/calendar-events?limit=200",
      );
      setEvents(result.items);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "일정을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  function changeMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const monthEvents = useMemo(() => {
    const monthStart = toIsoDate(new Date(viewYear, viewMonth, 1));
    const monthEnd = toIsoDate(new Date(viewYear, viewMonth + 1, 0));
    return events
      .filter((event) => event.start_date <= monthEnd && event.end_date >= monthStart)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [events, viewYear, viewMonth]);

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    const startDate = form.start_date;
    const endDate = form.end_date < startDate ? startDate : form.end_date;
    setBusy(true);
    setError("");
    try {
      if (form.id) {
        await api(`/calendar-events/${form.id}`, {
          method: "PATCH",
          body: {
            event_type: form.event_type,
            title: form.title.trim(),
            subject: form.subject.trim() || null,
            start_date: startDate,
            end_date: endDate,
            memo: form.memo.trim() || null,
          },
        });
      } else {
        await api("/calendar-events", {
          method: "POST",
          body: {
            event_type: form.event_type,
            title: form.title.trim(),
            subject: form.subject.trim() || null,
            start_date: startDate,
            end_date: endDate,
            memo: form.memo.trim() || null,
          },
        });
      }
      setForm(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "일정을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent(id: string) {
    setBusy(true);
    try {
      await api(`/calendar-events/${id}`, { method: "DELETE" });
      if (form?.id === id) setForm(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "일정을 지우지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
      {/* 달력 격자 */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-extrabold text-gray-950">
            {viewYear}년 {viewMonth + 1}월
          </h2>
          <div className="flex items-center gap-1">
            <button
              aria-label="지난달"
              className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center"
              onClick={() => changeMonth(-1)}
              type="button"
            >
              <Icon name="chevron-left" size={14} />
            </button>
            <button
              className="px-2.5 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 text-[11px] font-bold"
              onClick={() => {
                setViewYear(today.getFullYear());
                setViewMonth(today.getMonth());
              }}
              type="button"
            >
              오늘
            </button>
            <button
              aria-label="다음달"
              className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center"
              onClick={() => changeMonth(1)}
              type="button"
            >
              <Icon name="chevron-right" size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {WEEKDAYS.map((weekday, index) => (
            <div
              className={`text-center text-[11px] font-bold py-1 ${
                index === 5 ? "text-blue-500" : index === 6 ? "text-red-500" : "text-gray-400"
              }`}
              key={weekday}
            >
              {weekday}
            </div>
          ))}
        </div>

        {/*
          날짜 칸마다 테두리 상자를 두르고 그 안에 색깔 점만 찍던 전형적인
          "달력 컴포넌트" 모양이었다 — 무슨 일정인지는 옆 목록을 봐야만 알 수
          있었다. 칸을 상자로 두르지 않고 흰 배경 위에 띄우되, 그 대신 일정
          이름이 보이는 칩을 날짜 밑에 직접 넣는다. 오늘은 칸 전체를 칠하는
          대신 날짜 숫자에만 원을 둘러 표시한다.
        */}
        <div className="grid grid-cols-7 gap-x-1 gap-y-2">
          {grid.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} />;
            const dateIso = toIsoDate(date);
            const dayEvents = events
              .filter((event) => isWithin(dateIso, event))
              .sort((a, b) => a.title.localeCompare(b.title));
            const isToday = dateIso === todayIso;
            const weekdayIndex = (date.getDay() + 6) % 7;
            const visibleEvents = dayEvents.slice(0, 2);
            const hiddenCount = dayEvents.length - visibleEvents.length;
            return (
              <button
                className="min-h-[64px] rounded-lg p-1 flex flex-col items-center gap-1 text-left transition hover:bg-gray-50"
                key={dateIso}
                onClick={() => {
                  if (dayEvents.length > 0) {
                    setForm(formFromEvent(dayEvents[0]));
                  } else {
                    setForm(emptyForm(dateIso));
                  }
                }}
                type="button"
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    isToday
                      ? "bg-brand-500 text-white"
                      : weekdayIndex === 5
                        ? "text-blue-500"
                        : weekdayIndex === 6
                          ? "text-red-500"
                          : "text-gray-700"
                  }`}
                >
                  {date.getDate()}
                </span>
                <div className="w-full space-y-0.5">
                  {visibleEvents.map((dayEvent) => (
                    <span
                      className={`block truncate rounded px-1 py-px text-[9px] font-semibold leading-tight ${TYPE_STYLE[dayEvent.event_type].badge} ${TYPE_STYLE[dayEvent.event_type].text}`}
                      key={dayEvent.id}
                    >
                      {dayEvent.title}
                    </span>
                  ))}
                  {hiddenCount > 0 && (
                    <span className="block px-1 text-[9px] font-semibold text-gray-400">+{hiddenCount}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 이번 달 일정 목록 + 추가 */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-extrabold text-gray-950">이번 달 일정</h3>
            <button
              className="w-6 h-6 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold flex items-center justify-center"
              onClick={() => setForm(emptyForm())}
              type="button"
            >
              +
            </button>
          </div>

          {loading ? (
            <p className="text-[11px] text-gray-400 py-2">불러오는 중…</p>
          ) : monthEvents.length === 0 ? (
            <p className="text-[11px] text-gray-400 py-2">이번 달 등록된 일정이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {monthEvents.map((monthEvent) => {
                const style = TYPE_STYLE[monthEvent.event_type];
                return (
                  <li
                    className={`rounded-xl border p-2.5 transition hover:border-gray-300 ${style.badge}`}
                    key={monthEvent.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="min-w-0 text-left flex-1 cursor-pointer"
                        onClick={() => setForm(formFromEvent(monthEvent))}
                        type="button"
                      >
                        <span className={`text-[10px] font-bold ${style.text}`}>
                          {monthEvent.event_type}
                          {monthEvent.subject ? ` · ${monthEvent.subject}` : ""}
                        </span>
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {monthEvent.title}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {monthEvent.start_date === monthEvent.end_date
                            ? monthEvent.start_date
                            : `${monthEvent.start_date} ~ ${monthEvent.end_date}`}
                        </p>
                        {monthEvent.memo && (
                          <p className="text-[10px] text-gray-500 mt-0.5">{monthEvent.memo}</p>
                        )}
                      </button>
                      <div className="flex items-center gap-1.5 flex-none pt-0.5">
                        <button
                          className="text-[10px] text-gray-400 hover:text-brand-600 font-bold"
                          disabled={busy}
                          onClick={() => setForm(formFromEvent(monthEvent))}
                          type="button"
                        >
                          수정
                        </button>
                        <button
                          className="text-[10px] text-gray-400 hover:text-red-500 font-bold"
                          disabled={busy}
                          onClick={() => void removeEvent(monthEvent.id)}
                          type="button"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-red-600 font-semibold bg-red-50 border border-red-200 rounded-xl p-2.5">
            {error}
          </p>
        )}
      </div>

      {/* 추가 폼 */}
      {form && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-gray-950">
                {form.id ? "일정 수정" : "일정 추가"}
              </h3>
              {form.id && (
                <button
                  className="text-[11px] text-brand-600 hover:text-brand-700 font-bold"
                  onClick={() => setForm(emptyForm(form.start_date))}
                  type="button"
                >
                  + 새 일정 추가
                </button>
              )}
            </div>
            <form className="space-y-3" onSubmit={submitForm}>
              <div className="flex gap-1.5">
                {EVENT_TYPES.map((type) => (
                  <button
                    className={`flex-1 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                      form.event_type === type
                        ? `${TYPE_STYLE[type].badge} ${TYPE_STYLE[type].text}`
                        : "border-gray-200 text-gray-400 hover:bg-gray-50"
                    }`}
                    key={type}
                    onClick={() => setForm({ ...form, event_type: type })}
                    type="button"
                  >
                    {type}
                  </button>
                ))}
              </div>

              <input
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="제목 (예: 1학기 기말고사)"
                required
                value={form.title}
              />

              <input
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
                placeholder="과목 (선택)"
                value={form.subject}
              />

              <div className="flex gap-2">
                <label className="flex-1 text-[10px] text-gray-500 font-bold">
                  시작일
                  <input
                    className="w-full mt-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    onChange={(event) => {
                      const nextStart = event.target.value;
                      setForm((prev) => {
                        if (!prev) return null;
                        const shouldSyncEnd =
                          !prev.end_date ||
                          prev.end_date < nextStart ||
                          prev.start_date === prev.end_date;
                        return {
                          ...prev,
                          start_date: nextStart,
                          end_date: shouldSyncEnd ? nextStart : prev.end_date,
                        };
                      });
                    }}
                    required
                    type="date"
                    value={form.start_date}
                  />
                </label>
                <label className="flex-1 text-[10px] text-gray-500 font-bold">
                  종료일
                  <input
                    className="w-full mt-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    min={form.start_date}
                    onChange={(event) => {
                      const nextEnd = event.target.value;
                      setForm((prev) => {
                        if (!prev) return null;
                        const adjustedEnd =
                          prev.start_date && nextEnd < prev.start_date ? prev.start_date : nextEnd;
                        return { ...prev, end_date: adjustedEnd };
                      });
                    }}
                    required
                    type="date"
                    value={form.end_date}
                  />
                </label>
              </div>

              <textarea
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                onChange={(event) => setForm({ ...form, memo: event.target.value })}
                placeholder="메모 (선택)"
                rows={2}
                value={form.memo}
              />

              {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}

              <div className="flex gap-2 pt-1">
                {form.id && (
                  <button
                    className="py-2 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold flex-none"
                    disabled={busy}
                    onClick={() => {
                      if (form.id) void removeEvent(form.id);
                    }}
                    type="button"
                  >
                    삭제
                  </button>
                )}
                <button
                  className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold disabled:opacity-60"
                  disabled={busy || !form.title.trim()}
                  type="submit"
                >
                  {busy ? "저장 중…" : form.id ? "수정 완료" : "저장"}
                </button>
                <button
                  className="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold"
                  onClick={() => {
                    setForm(null);
                    setError("");
                  }}
                  type="button"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
