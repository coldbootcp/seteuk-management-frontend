---
name: 세특연구소 (Seteuk Lab)
description: 생기부 세특을 하나의 연구 서사로 엮는 고등학생용 AI 코치
colors:
  action-blue: "#3182F6"
  action-blue-deep: "#1B64DA"
  action-blue-deeper: "#134EB2"
  blue-haze: "#C0DEFF"
  blue-mist: "#F0F7FF"
  legacy-blue-wash: "#E8F3FF"
  ink: "oklch(13% 0.028 261.692)"
  ink-soft: "oklch(21% 0.034 264.665)"
  slate-700: "oklch(37.3% 0.034 259.733)"
  slate-600: "oklch(44.6% 0.03 256.802)"
  slate-500: "oklch(55.1% 0.027 264.364)"
  slate-400: "oklch(70.7% 0.022 261.325)"
  hairline: "oklch(92.8% 0.006 264.531)"
  divider: "oklch(96.7% 0.003 264.542)"
  tile: "oklch(98.5% 0.002 247.839)"
  card-white: "#FFFFFF"
  paper: "#F8F9FA"
  legacy-ink: "#191F28"
  legacy-muted: "#4E5968"
  legacy-subtle: "#8B95A1"
  legacy-border: "#E5E8EB"
  legacy-surface-2: "#F2F4F6"
  success-text: "oklch(50.8% 0.118 165.612)"
  success-wash: "oklch(97.9% 0.021 166.113)"
  warning-text: "oklch(41.4% 0.112 45.904)"
  warning-wash: "oklch(98.7% 0.022 95.277)"
  danger-text: "oklch(57.7% 0.245 27.325)"
  danger-wash: "oklch(97.1% 0.013 17.38)"
  legacy-green: "#00A881"
  legacy-red: "#E42939"
typography:
  display:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.333
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  body-compact:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.333
  meta:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
  eyebrow:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "0.05em"
rounded:
  xs: "4px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  bubble: "18px"
  2xl: "24px"
  full: "9999px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "2.5": "10px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "28px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue-deep}"
    textColor: "{colors.card-white}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-deeper}"
  button-primary-bright:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card-white}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  button-primary-bright-hover:
    backgroundColor: "{colors.action-blue-deep}"
  button-secondary:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.slate-700}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.tile}"
  button-legacy-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "46px"
  button-legacy-small:
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "34px"
  input:
    backgroundColor: "{colors.tile}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  input-focus:
    backgroundColor: "{colors.card-white}"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.xl}"
    padding: "24px"
  tile:
    backgroundColor: "{colors.tile}"
    rounded: "{rounded.lg}"
    padding: "16px"
  nav-item:
    textColor: "{colors.slate-600}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  nav-item-active:
    backgroundColor: "{colors.blue-mist}"
    textColor: "{colors.action-blue-deep}"
  badge-brand:
    backgroundColor: "{colors.blue-mist}"
    textColor: "{colors.action-blue-deep}"
    typography: "{typography.meta}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
  badge-success:
    backgroundColor: "{colors.success-wash}"
    textColor: "{colors.success-text}"
    typography: "{typography.meta}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  badge-danger:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger-text}"
    typography: "{typography.meta}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  status-pill-legacy:
    backgroundColor: "{colors.legacy-blue-wash}"
    textColor: "{colors.action-blue}"
    rounded: "{rounded.full}"
    padding: "3px 9px"
  chat-bubble-user:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card-white}"
    typography: "{typography.body}"
    rounded: "{rounded.bubble}"
    padding: "11px 16px"
  chat-bubble-assistant:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.legacy-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.bubble}"
    padding: "11px 16px"
---

# Design System: 세특연구소 (Seteuk Lab)

## Overview

**Creative North Star: "The Quiet Desk (조용한 책상)"**

학기 중에 학생이 혼자 앉아 자기 기록을 정리하는 책상. 화면은 그 책상 위처럼 조용해야
한다 — 흰 바탕, 파란색 하나, 머리카락처럼 얇은 경계선, 거의 느껴지지 않는 그림자.
시선을 끄는 것은 장식이 아니라 학생 자신의 기록과 그 근거다. 이 담담함은 제품 목소리
("과장 없이, 판단은 학생이")를 시각으로 옮긴 것이다.

밀도는 높은 편이다. 메인 앱은 248px 사이드바와 끈적한 상단바 아래에 흰 카드를 격자로
깔고, 카드 안은 12px 굵은 글씨와 11px 보조 글씨로 촘촘하게 채운다. 위계는 글자 크기
차이보다 **굵기(700/800)와 색 명도(ink ↔ slate-400)**로 만든다. 컴포넌트의 성격은
**또렷하고 절제된** 것이다: 둥근 12px 모서리, 1px 경계, 채도 높은 파랑은 행동에만.

시스템은 현재 **두 겹**으로 되어 있다. 목업(preview-3200)에서 옮겨 온 **Tailwind 레이어**
(`@theme`의 brand 스케일 + Tailwind 기본 gray)가 대부분의 화면을 그리고, 그 이전의
**시맨틱 CSS 레이어**(`:root`의 Toss 계열 토큰과 `.btn`·`.form-field`·`.chat-bubble` 같은
의미 클래스)가 수시 지원 준비, 성적표 입력 셀, 시간표 모달, 챗봇 말풍선에 남아 있다.
마이그레이션 방향은 Tailwind 레이어다(`docs/DESIGN_MIGRATION.md`). 라이트 테마만 있고
다크 모드는 없다.

**Key Characteristics:**
- 흰 캔버스 위 흰 카드, 경계선으로 분리하는 평면 구성
- 행동 색은 액션 블루 하나, 상태 색(초록·호박·빨강)은 옅은 워시 + 진한 글자로만
- Pretendard 한 가족, 굵기로 만드는 위계, 12px 중심의 촘촘한 본문
- 12px 모서리가 버튼·입력칸·내비·내부 타일의 공통 언어, 카드는 16px
- 그림자는 쉬는 상태에서 거의 없음, 떠 있는 것(모달·드롭다운·시트)만 뚜렷하게

## Colors

흰 바탕과 쿨 그레이 위에 토스 계열 액션 블루 하나를 올린, 채도를 아끼는 팔레트다.

### Primary
- **액션 블루 (Action Blue)** (#3182F6): 옛 `--primary`와 `brand-500`이 같은 값이다. 사용자
  말풍선, 활성 내비의 점, 아바타 원, 옛 `.btn-primary`, 밝은 변형 기본 버튼의 바탕.
- **깊은 액션 블루 (Action Blue Deep)** (#1B64DA): `brand-600`. 가장 많이 쓰이는 파랑이다 —
  기본 버튼 바탕, 활성 내비 글자, 링크성 텍스트, eyebrow 라벨.
- **더 깊은 액션 블루 (Action Blue Deeper)** (#134EB2): `brand-700`. 기본 버튼의 hover,
  파란 워시 위 강조 글자.
- **블루 헤이즈 (Blue Haze)** (#C0DEFF): `brand-200`. 파란 워시 패널·배지의 경계선(보통
  60~80% 불투명도로 쓴다).
- **블루 미스트 (Blue Mist)** (#F0F7FF): `brand-50`. 활성 내비 바탕, 파란 배지 바탕, 옅은
  강조 패널.
- **옛 블루 워시 (Legacy Blue Wash)** (#E8F3FF): 옛 `--primary-subtle`. 시맨틱 CSS 레이어의
  활성 배지·안내 박스 바탕.

### Neutral
- **잉크 (Ink)** (Tailwind `gray-950`): 페이지·카드 제목. 가장 어두운 글자.
- **부드러운 잉크 (Ink Soft)** (`gray-900`): 입력값, 목록 제목, 굵은 본문.
- **슬레이트 700 / 600** (`gray-700`, `gray-600`): 본문과 비활성 내비 글자, 보조 버튼 글자.
- **슬레이트 500** (`gray-500`): 설명문, 부제.
- **슬레이트 400** (`gray-400`): 메타 정보, 날짜, 비활성 아이콘, placeholder.
- **헤어라인 (Hairline)** (`gray-200`): 모든 카드·입력칸·보조 버튼의 1px 경계. 카드에서는
  80% 불투명도로 쓴다. 코드에서 가장 많이 쓰이는 색이다.
- **디바이더 (Divider)** (`gray-100`): 카드 안 구획선, 사이드바 구획선.
- **타일 (Tile)** (`gray-50`): 카드 안 내부 타일, 입력칸 바탕(50% 불투명), hover 바탕.
- **카드 화이트 (Card White)** (#FFFFFF): 앱 바탕이자 카드 바탕.
- **종이 (Paper)** (#F8F9FA): `surface-bg`. 온보딩·관문(`GateFrame`)과 랜딩 하단의 바탕 —
  흰 카드가 떠 보이게 하는 유일한 회색 바탕.
- **옛 잉크 / 옛 뮤트 / 옛 서틀** (#191F28 / #4E5968 / #8B95A1): 시맨틱 레이어의 `--text`,
  `--muted`, `--subtle`. `body`의 기본 글자색이 옛 잉크다.
- **옛 경계 / 옛 표면 2** (#E5E8EB / #F2F4F6): `--border`, `--surface-2`. 옛 `.btn-secondary`
  바탕과 옛 카드 경계.

### Status
상태 색은 **옅은 워시 바탕 + 200단계 경계 + 진한 글자**의 세 겹으로만 쓴다. 채운 색 면으로
쓰지 않는다(예외: 8px 크기의 상태 점).
- **성공 (Success)** (`emerald-700` 글자 / `emerald-50` 워시): 완료, 준비됨, 강점.
- **주의 (Warning)** (`amber-900` 글자 / `amber-50` 워시): 확인 필요, 반복 패턴.
- **위험 (Danger)** (`red-600` 글자 / `red-50` 워시): 오류, 약점, 삭제.
- **옛 초록 / 옛 빨강** (#00A881 / #E42939): 시맨틱 레이어의 `--green`, `--red`. 챗봇 도구
  실행 칩, `.btn-danger`.

### Named Rules
**The One Blue Rule.** 화면의 기본 행동은 액션 블루 계열로만 칠한다. 초록·호박·보라는 행동이
아니라 상태와 분류를 말한다. 예외는 둘이다: 파괴적 행동(삭제 확인은 `red-600` 채움, 옛
`.btn-danger`는 빨강 워시)과, 주의 배너 안에서 그 배너를 해결하는 작은 버튼(흰 바탕 +
`amber-300` 경계 + `amber-800` 글자).

**The Wash, Not Fill Rule.** 상태 색은 50단계 워시 위에 700~900단계 글자로 쓴다. 채도 높은
상태 색으로 넓은 면을 채우지 않는다.

## Typography

**Display Font:** Pretendard (with -apple-system, Apple SD Gothic Neo, Noto Sans KR, system-ui)
**Body Font:** Pretendard (같은 스택)

**Character:** 한 가족으로 모든 것을 한다. 한글 가독성이 좋은 산세리프를 굵게 써서, 크기를
크게 벌리지 않고도 제목과 본문이 갈린다. `layout.tsx`는 Noto Sans KR과 Plus Jakarta Sans도
불러오지만 화면 규칙에서 Plus Jakarta Sans를 직접 쓰는 곳은 없다.

### Hierarchy
- **Display** (800, 1.875rem → sm 3rem → md 3.75rem, 1.15, -0.025em): 비로그인 랜딩 히어로
  제목에만 쓴다.
- **Headline** (800, 1.5rem, 1.333, -0.025em): 화면 제목(이번 학기, 성적 관리 등). 랜딩
  섹션 제목은 1.5rem → md 2.25rem.
- **Title** (700~800, 1rem, 1.5): 카드 제목. 가장 흔한 제목 조합이다(`text-base font-bold
  text-gray-950`). 카드 안 소제목은 12px 800으로 한 단계 더 내린다.
- **Body** (400, 14px, 1.55): `body` 기본값. 시맨틱 레이어 화면과 챗봇 말풍선(14px, 1.65)에서
  본문 역할을 한다.
- **Body Compact** (400~600, 12px, 1.625): Tailwind 레이어 화면의 실제 본문. 카드 설명,
  목록 항목, 진단 리포트 항목이 이 크기다.
- **Label** (700~800, 12px): 버튼, 내비 항목, 폼 라벨.
- **Meta** (600~700, 11px): 날짜·학기·출처 같은 보조 정보, 배지 글자.
- **Eyebrow** (800, 10px, 0.05em, UPPERCASE): 카드 위의 분류 라벨. 액션 블루 딥 색. 영문
  대문자 라벨("AI 진단 요약" 같은 한글도 같은 스타일)로 쓰인다.

### Named Rules
**The Weight-Not-Size Rule.** 위계는 굵기와 명도로 만든다. 카드 안에서 제목과 본문의 크기
차이는 보통 4px 이하이고, 그 대신 800 대 400, ink 대 slate-500으로 가른다.

크기 분포(Tailwind 레이어 기준 사용 횟수): 12px가 압도적으로 많고, 11px와 10px가 그다음이며,
14px 이상은 제목에 몰려 있다. 11px는 대부분 메타·배지·라벨이지만, 일부 안내 박스와 오류
박스처럼 읽어야 하는 문장에도 11px가 쓰인다.

## Layout

**앱 셸.** 2열 그리드: 248px 흰 사이드바(오른쪽 1px 경계, 화면 높이로 sticky) + 본문. 본문
위에는 sticky 상단바(흰색 92% + 12px 배경 블러, 아래 1px 경계, 14px 32px 패딩)가 브레드크럼·
검색·설정 버튼을 든다. 본문 영역은 28px 32px 40px 패딩이다.

**관문 틀.** 온보딩과 진단·상담 관문은 사이드바 없이 `GateFrame`을 쓴다: 종이(Paper) 바탕,
56px 높이의 흰 sticky 상단바, 가운데 정렬 컨테이너(max-width 64rem, 넓은 변형 72rem),
좌우 16~20px, 위아래 32px.

**격자.** 카드는 `grid` + 16~24px 간격으로 놓인다. 흔한 구성은 2열 주제 카드, 4장 지표 줄,
2:1(차트 + 분포), 1/3 폼 + 2/3 피드, 8/4 프로필 그리드, 1:3 대화 목록 + 대화 창.

**간격 리듬.** Tailwind 4px 단위. 카드 내부 패딩은 20~24px(`p-5`/`p-6`, 강조 카드 28px),
카드 안 요소 간격은 8~12px, 인접 요소 간격은 6~8px이 가장 흔하다.

**반응형.** Tailwind 레이어는 `sm`(640) · `md`(768) · `lg`(1024)에서 열을 늘린다(모바일은 1열
기본). 시맨틱 레이어는 560 · 768 · 880 · 900 · 960 · 1024 · 1080px의 개별 미디어 쿼리를 쓴다.
1100px 이하에서는 상단바의 설명용 상태 알약이 빠진다(검색·설정은 남는다). 960px 이하에서
사이드바가 224px로 좁아진다. **768px 이하에서는 같은 사이드바가 화면 왼쪽 밖의 서랍
(`min(304px, 86vw)`)이 되고 본문은 1열, 본문 패딩은 16px가 된다.** 상단바는 한 줄
[메뉴] 현재 화면 이름 [검색]으로 줄고, 검색은 버튼을 누르면 상단바 아래 한 줄로 펼쳐진다.
메뉴 구조는 데스크톱과 같다 — 모바일에서 탭을 줄이거나 다시 묶지 않는다.

### Named Rules
**The Card Grid Rule.** 메인 앱 화면은 흰 카드들의 격자로 짓는다. 카드 밖에는 화면 제목과
짧은 안내만 선다(비로그인 랜딩은 이 규칙 밖이다).

## Elevation & Depth

평면이 기본이다. 흰 바탕 위의 흰 카드는 그림자가 아니라 **1px 헤어라인 경계**로 구분된다.
쉬는 상태의 카드에는 거의 보이지 않는 `shadow-xs`만 붙는다. 뚜렷한 그림자는 **화면 위에
떠 있는 것**(모달, 검색 드롭다운, 과목 서랍, 로그인 카드, 랜딩의 워크스페이스 미리보기)에만
쓴다. 깊이를 더 표현해야 할 때는 그림자보다 **종이 바탕 → 흰 카드 → 타일(gray-50)**의 명도
층을 먼저 쓴다.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): 모든 흰 카드의 기본.
- **Floating** (`box-shadow: 0 12px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.04)`): 상단바
  검색 결과 드롭다운.
- **Dialog** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`
  또는 `0 25px 50px -12px rgb(0 0 0 / 0.25)`): 확인 모달, 로그인 카드, 과목 서랍.
- **Featured choice** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`):
  온보딩에서 추천 경로 카드(2px 액션 블루 경계와 함께).
- **Drawer** (`box-shadow: 12px 0 32px rgb(25 31 40 / 0.12)`): 768px 이하에서 열린 사이드바 서랍.
- **User bubble** (`box-shadow: 0 2px 6px rgba(49,130,246,0.2)`): 사용자 말풍선 아래의 파란 기운.
- **Focus ring, legacy** (`box-shadow: 0 0 0 3px rgba(49,130,246,0.12)`): `.form-field` 입력칸 포커스.

모달 뒤 스크림은 `gray-900` 30% 또는 검정 30%다.

### Named Rules
**The Flat-At-Rest Rule.** 페이지에 붙어 있는 것은 경계선으로, 페이지 위에 떠 있는 것만
그림자로 말한다. hover에서 카드를 들어 올리지 않고 경계선 색을 브랜드 쪽(brand-300/400)으로
바꾼다.

## Shapes

부드럽지만 둥글둥글하지 않은 모서리. **12px**가 상호작용 요소의 공통 언어다 — 버튼, 입력칸,
내비 항목, 카드 안 타일, 진단 리포트 칸이 모두 12px다. 그것들을 담는 카드는 한 단계 큰
**16px**, 화면 위에 떠서 혼자 서는 큰 판(로그인 카드, 랜딩 미리보기)은 **24px**다. 작은 배지는
**4px**(`rounded`) 또는 8px, 알약형 상태 배지와 아바타·상태 점은 완전한 원이다.

말풍선만 예외적으로 18px 모서리에 꼬리 쪽 한 모서리를 4px로 깎는다(사용자는 오른쪽 아래,
어시스턴트는 왼쪽 아래).

시맨틱 레이어의 옛 반경은 `--r-xs` 4 · `--r-sm` 8 · `--r-md` 10 · `--r-lg` 12 · `--r-xl` 14 ·
`--r-2xl` 16px이고, 옛 `.btn`은 8px라 새 버튼(12px)보다 각이 조금 더 서 있다.

경계선은 거의 항상 1px 헤어라인이다. 2px 경계는 "추천" 선택 카드처럼 하나를 골라 보여줄
때만 쓴다. 점선 경계는 로그아웃 버튼 같은 가벼운 부가 행동에 쓰인다.

## Components

### Buttons
또렷하고 짧다. 굵은 12px 글자, 12px 모서리, 색 변화만 있는 hover.
- **Shape:** 부드러운 모서리(12px). 랜딩의 큰 CTA만 16px.
- **Primary:** 깊은 액션 블루 바탕 + 흰 700~800 글자, 10~12px 16px 패딩. 폼 제출 버튼은 보통
  전체 폭이다. hover에서 더 깊은 액션 블루로. 비활성은 60% 불투명.
- **Primary, bright 변형:** 액션 블루 바탕 → hover 깊은 액션 블루. 비활성은 `gray-200` 바탕 +
  `gray-400` 글자로 바뀐다. 온보딩·상담 흐름에서 쓰인다.
- **Secondary:** 흰 바탕 + 1px 헤어라인 + 슬레이트 700 글자, hover에서 타일(gray-50) 바탕.
- **Legacy `.btn`:** 높이 46px(작은 크기 34px), 8px 모서리, 14px 700. `btn-primary`(액션 블루),
  `btn-secondary`(옛 표면 2 바탕), `btn-ghost`(바탕 없음, hover 옛 표면 2), `btn-danger`(빨강
  워시 + 빨강 경계). 프로필·활동 기록·수시 준비 화면에 남아 있다.
- **Focus:** 버튼에는 전용 `focus-visible` 스타일이 없다(브라우저 기본 윤곽선에 기댄다).

### Chips / Badges
작고 굵다. 워시 바탕 + 진한 글자 + (선택) 200단계 경계.
- **Brand badge:** 블루 미스트 바탕 + 깊은 액션 블루 10~11px 700~800, 4px 모서리. 과목 태그,
  학기 표시(`2-1`), "재학생" 표기.
- **Tone badge:** 성공·위험·중립 워시 + 같은 계열 200단계 경계, 8px 모서리, 11px 600.
- **Legacy status pill:** `.status-badge` — 완전한 원형, 11.5px 600, 3px 9px. `badge-active`
  (옛 블루 워시/액션 블루), `badge-done`(옛 초록 워시), `badge-planned`/`badge-muted`(옛 표면 2).
- **Tool chip (챗봇):** 옛 초록 워시 + 초록 경계, 6px 모서리, 실패하면 빨강 워시.

### Cards / Containers
- **Corner Style:** 16px(`rounded-2xl`).
- **Background:** 카드 화이트.
- **Shadow Strategy:** Card rest(Elevation 참고).
- **Border:** 1px 헤어라인 80% 불투명.
- **Internal Padding:** 20~24px, 큰 카드는 md 이상에서 28px. 목록형 카드는 `overflow-hidden` +
  내부 구획선(디바이더).
- **Inner tile:** 카드 안의 하위 묶음은 12px 모서리의 타일(gray-50 바탕, 헤어라인 경계, 16px
  패딩). 강조 타일은 블루 미스트 → blue-50 방향의 아주 옅은 가로 그라데이션 바탕 + brand-100
  경계를 쓴다(서사 DNA 요약).

### Inputs / Fields
- **Style:** 12px 모서리, 1px 헤어라인 경계, 타일 색 50% 바탕, 12px 600 글자, 8px 14px 패딩.
- **Focus:** 바탕이 흰색으로 바뀌고 경계가 액션 블루(`brand-500`)로. 링은 대체로 없다
  (로그인·계정 폼만 2px brand-500 링). 옛 `.form-field`는 흰 바탕 + 액션 블루 경계 + 3px 옅은
  파란 링.
- **Label:** 11px 700 옛 뮤트 색(`.form-field label`) 또는 12px 700.
- **Error:** 입력칸 아래·폼 위에 빨강 워시 + 빨강 200 경계 + 11px 600 빨강 글자 박스.
  입력칸을 잠그지 않는다.

### Navigation
- **Sidebar item:** 전체 폭, 10px 14px 패딩, 12px 모서리, 12px 600 글자, 16px SVG 아이콘
  (stroke 2, currentColor). 비활성은 슬레이트 600 글자 + 슬레이트 400 아이콘 + 투명 경계, hover
  타일 바탕 + 잉크 글자.
- **Active:** 블루 미스트 바탕 + 블루 헤이즈 60% 경계 + 깊은 액션 블루 700 글자, 오른쪽에 6px
  액션 블루 점. 학기 배지는 활성일 때 액션 블루 채움 + 흰 글자로 뒤집힌다.
- **Sidebar head:** 로고 36px + "세특연구소" 15px 800 + 부제 11px, 아래 디바이더. 그 아래 학생
  카드(타일 바탕 버튼, 이니셜 원형 아바타).
- **Topbar:** "Academic Hub / 현재 탭" 브레드크럼(16px 800 + 12px 600), 가운데 검색 입력칸
  (8px 모서리, 결과는 Floating 드롭다운), 오른쪽 상태 알약과 32px 설정 버튼.
- **Mobile drawer (≤768px):** 상단바 왼쪽 44px 메뉴 버튼이 사이드바를 서랍으로 연다. 서랍은
  280ms `cubic-bezier(0.22, 1, 0.36, 1)`로 밀려 들어오고, 뒤에 `gray-900` 30% 스크림이 깔린다.
  서랍 안 내비 항목은 44px 높이 · 14px 글자로 커진다. 스크림 탭, 닫기 버튼, Escape, 탭 선택으로
  닫히며 포커스는 메뉴 버튼으로 돌아온다. 열린 동안 본문은 `inert`, 페이지 스크롤은 잠긴다.
  `prefers-reduced-motion`에서는 전환 없이 나타난다.
- **Mobile topbar (≤768px):** 44px 아이콘 버튼(12px 모서리, 누르면 gray-100, 열린 상태는 블루
  미스트 + 깊은 액션 블루) 사이에 현재 화면 이름을 16px 800 잉크로 둔다. 브레드크럼의
  "Academic Hub"와 설정 버튼은 숨긴다(프로필은 서랍에서 닿는다). 펼친 검색 입력칸은 iOS 확대를
  막기 위해 16px 글자다.

### Chat Bubbles (Signature Component)
상담 관문과 AI 컨설턴트 탭이 `chat-thread.tsx`로 같은 말풍선을 쓴다. 최대 폭 80%, 14px/1.65,
`word-break: keep-all`. 사용자 말풍선은 액션 블루 채움 + 흰 글자 + 파란 그림자, 어시스턴트
말풍선은 흰 바탕 + 옛 경계 + 옛 잉크 글자 + 아주 옅은 그림자. 마크다운 굵게는 렌더링된다.

### Diagnosis Report Grid (Signature Component)
진단 리포트는 2열 4칸이다: 강점(성공 워시), 약점(위험 워시), 기회(blue-50 워시), 반복되는
패턴(주의 워시). 각 칸은 12px 모서리 + 같은 계열 200단계 경계 70% + 16px 패딩, 머리에 8px 상태
점과 12px 800 라벨, 본문은 12px 슬레이트 600 목록. 항목이 없으면 "해당 항목이 없습니다."를
슬레이트 400으로 쓴다 — 빈 칸을 지어낸 내용으로 채우지 않는다.

## Do's and Don'ts

### Do:
- **Do** 새 화면은 Tailwind 레이어로 짓는다: brand 스케일과 Tailwind `gray`, 12px/16px 모서리,
  `shadow-xs` 카드.
- **Do** 카드를 흰 바탕 + 1px 헤어라인(`gray-200` 80%) + 16px 모서리 + 20~24px 패딩으로 만든다.
- **Do** 버튼·입력칸·내비·내부 타일은 12px 모서리로 맞춘다.
- **Do** 아이콘은 `app/icons.tsx`의 `<Icon />`으로 넣는다. 기본 16px이고, 12~14px 글자 옆에서는
  13~14px, 카드 머리의 원형 칸에서는 18~22px, 안내 화면 한가운데에서는 28~32px로 쓴다.
- **Do** 상태는 워시 바탕 + 200단계 경계 + 700~900단계 글자로 표현한다.
- **Do** 떠 있는 것(모달·드롭다운·서랍)에만 뚜렷한 그림자를 쓰고, 나머지는 경계선과 명도 층으로
  깊이를 만든다.
- **Do** 데이터가 없는 자리는 슬레이트 400의 짧은 안내 문장으로 비워 둔다.

### Don't:
- **Don't** 이모지를 아이콘으로 쓰지 않는다. 아이콘은 `app/icons.tsx`의 `<Icon name="…" />`로만
  그린다. 새 그림이 필요하면 같은 규격(24 좌표계, 선 굵기 2, 둥근 끝, `currentColor`)으로 그
  파일에 추가한다. 화살표·체크·별(→ ✓ ★ ▾) 같은 글자 기호는 아직 곳곳에 남아 있다.
- **Don't** 그라데이션 텍스트(`bg-clip-text`)와 장식용 블러 배경(`blur-3xl` 원 등)을 쓰지 않는다
  (현재 랜딩 히어로가 둘 다 어긋나 있다).
- **Don't** 실체 없는 배지를 달지 않는다. 배지는 실제 상태나 데이터를 나타낼 때만 쓴다(현재
  사이드바와 관문 상단바의 'Pro' 배지가 어긋나 있다 — 결제·구독은 범위 밖이다).
- **Don't** 기본 행동 버튼에 액션 블루 외의 색을 쓰지 않는다(삭제와 주의 배너 안 해결 버튼만
  예외 — The One Blue Rule).
- **Don't** 상태 색으로 넓은 면을 채우지 않는다.
- **Don't** 시맨틱 CSS 레이어(`:root`의 `--primary`·`--muted` 등, `.btn` 계열)에 새 토큰이나 새
  의미 클래스를 더하지 않는다. 옮기는 중인 레이어다.
- **Don't** Tailwind preflight를 켜지 않는다. `globals.css`의 자체 리셋과 겹쳐 기존 규칙의
  기본값이 조용히 어긋난다.
