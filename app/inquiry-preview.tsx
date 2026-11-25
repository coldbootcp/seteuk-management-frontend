"use client";

import { useState } from "react";
import { Icon, type IconName } from "./icons";

const stages: {
  label: string;
  action: string;
  icon: IconName;
  heading: string;
  note: string;
  readingsLabel: string;
  readings: { label: string; value: string }[];
  takeawayLabel: string;
  takeaway: string;
}[] = [
  {
    label: "지난 기록",
    action: "수업에서 남긴 질문 찾기",
    icon: "file",
    heading: "운동장 두 곳의 온도를 재다",
    note: "점심시간, 햇볕이 드는 운동장과 나무 그늘에서 온도를 한 번씩 쟀다. 아침에도 두 곳의 차이가 이만큼 클까?",
    readingsLabel: "점심시간에 적은 온도",
    readings: [
      { label: "햇볕이 드는 곳", value: "30 °C" },
      { label: "나무 그늘", value: "27 °C" },
    ],
    takeawayLabel: "AI가 짚은 단서",
    takeaway: "두 곳을 비교한 기록은 있지만, 측정한 시간은 점심 한 번이에요. 학생이 남긴 ‘아침에도 그럴까?’에서 다음 주제를 찾을 수 있어요.",
  },
  {
    label: "이번 학기 계획",
    action: "근거를 보고 주제 고르기",
    icon: "compass",
    heading: "시간대별로 온도 차이 비교하기",
    note: "AI가 제안한 시간대별 비교를 과학 수행평가 주제로 골랐다. 같은 두 곳에서 세 번 측정하고, 그래프에 두 선을 그려 보기로 했다.",
    readingsLabel: "내가 정한 측정 시간",
    readings: [
      { label: "등교 후", value: "오전 9시" },
      { label: "점심시간", value: "낮 12시" },
      { label: "오후 수업 후", value: "오후 3시" },
    ],
    takeawayLabel: "이 주제를 제안한 이유",
    takeaway: "지난번에 비교한 장소를 그대로 두고 시간대를 늘리면, 점심에만 관찰했던 온도 차이가 하루 동안 어떻게 달라지는지 살펴볼 수 있어요.",
  },
  {
    label: "활동 후 기록",
    action: "배운 점과 다음 질문 남기기",
    icon: "pen",
    heading: "그래프에서 찾은 새로운 질문",
    note: "두 곳의 온도를 재서 그래프로 그렸다. 측정한 세 시간 중 낮 12시에 차이가 가장 컸다. 구름이 많은 날에도 같은 모양이 나올까?",
    readingsLabel: "직접 측정한 두 곳의 온도 차이",
    readings: [
      { label: "오전 9시", value: "2 °C" },
      { label: "낮 12시", value: "4 °C" },
      { label: "오후 3시", value: "3 °C" },
    ],
    takeawayLabel: "다음 탐구로 이어지는 기록",
    takeaway: "실제로 한 일과 배운 점을 이번 학기 계획에 연결해 저장해요. 다음에 주제를 고를 때 날씨에 따라 다시 비교해 보고 싶었던 이유까지 돌아볼 수 있어요.",
  },
];

export function InquiryPreview() {
  const [selected, setSelected] = useState(0);
  const stage = stages[selected];

  return (
    <section aria-labelledby="preview-heading" className="scroll-mt-20 border-y border-gray-200/80 bg-[#f3f6fa] py-14 sm:py-16 lg:py-20" id="preview">
      <div className="mx-auto grid max-w-[1208px] items-center gap-8 px-5 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16 lg:px-10">
        <div>
          <h2 className="text-[30px] leading-[1.2] font-extrabold tracking-[-0.045em] text-gray-950 sm:text-4xl" id="preview-heading">
            한 번의 관찰이<br />다음 탐구가 되기까지
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed break-keep text-gray-600 sm:text-base">
            운동장에서 온도를 잰 가상의 학생이 다음 학기에 어떤 질문을 골랐는지 따라가 보세요.
          </p>
          <fieldset className="m-0 mt-7 grid min-w-0 grid-cols-3 gap-1.5 border-0 p-0 lg:max-w-sm lg:grid-cols-1 lg:gap-2">
            <legend className="sr-only">탐구 예시 단계 선택</legend>
            {stages.map((item, index) => (
              <label className="relative cursor-pointer" key={item.label}>
                <input
                  aria-controls="inquiry-note"
                  checked={index === selected}
                  className="peer sr-only"
                  name="inquiry-stage"
                  onChange={() => setSelected(index)}
                  type="radio"
                  value={item.label}
                />
                <span className="flex h-full min-h-12 items-center justify-center gap-2 rounded-xl border border-solid border-gray-200 bg-white px-1.5 py-2.5 text-center text-xs font-bold break-keep text-gray-600 transition-colors hover:border-brand-300 peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 lg:justify-start lg:gap-3 lg:px-4 lg:py-3 lg:text-left lg:text-[15px]">
                  <Icon className="hidden shrink-0 lg:block" name={item.icon} size={20} />
                  <span>
                    {item.label}
                    <span className="mt-0.5 hidden text-xs font-medium text-gray-600 lg:block">{item.action}</span>
                  </span>
                  <Icon className="ml-auto hidden lg:block" name="chevron-right" size={16} />
                </span>
              </label>
            ))}
          </fieldset>
        </div>
        <article aria-labelledby="inquiry-note-title" className="min-w-0 rounded-2xl border border-solid border-gray-200 bg-white px-5 py-5 shadow-card sm:px-8 sm:py-7" id="inquiry-note">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-4 text-xs font-bold text-gray-600">
            <span className="inline-flex items-center gap-2"><Icon name="pen" size={16} />탐구 노트 예시</span>
            <span>과학 탐구</span>
          </div>
          <div aria-atomic="true" aria-live="polite" className="pt-6">
            <h3 className="text-[23px] leading-snug font-extrabold tracking-[-0.035em] break-keep text-gray-950 sm:text-[28px]" id="inquiry-note-title">{stage.heading}</h3>
            <p className="mt-3 text-[15px] leading-[1.8] break-keep text-gray-700">{stage.note}</p>
            <div className="my-5 rounded-xl border border-solid border-gray-200/90 bg-surface-bg p-4 sm:my-6 sm:px-5">
              <p className="mb-3 text-xs font-semibold text-gray-600">{stage.readingsLabel}</p>
              <dl className="m-0 flex divide-x divide-gray-200">
                {stage.readings.map((reading) => (
                  <div className="min-w-0 flex-1 px-2.5 first:pl-0 last:pr-0 sm:px-4" key={reading.label}>
                    <dt className="text-xs leading-relaxed break-keep text-gray-600">{reading.label}</dt>
                    <dd className="m-0 mt-1 text-base leading-snug font-extrabold tracking-tight whitespace-nowrap text-gray-900 sm:text-xl">{reading.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="border-l-2 border-brand-500 pl-3.5">
              <p className="text-xs font-bold text-brand-700">{stage.takeawayLabel}</p>
              <p className="mt-1 text-sm leading-relaxed break-keep text-gray-700">{stage.takeaway}</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
