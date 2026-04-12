/**
 * 현재탭 드래그 앤 드롭 — 순수 로직 함수
 *
 * Chrome 탭의 인덱스 체계:
 * - 탭은 윈도우 내에서 0부터 시작하는 flat index를 가짐
 * - chrome.tabs.move()는 "제거 후 삽입" 방식
 *   → 소스가 타겟보다 앞에 있으면 타겟 인덱스가 1 줄어듦
 */

// ── 타입 ──

export type SimpleTab = {
  id: number;
  index: number;
  groupId: number; // -1 = ungrouped
  pinned: boolean;
};

export type SimpleGroup = {
  id: number;
  title: string;
  color: string;
  collapsed: boolean;
};

export type Segment =
  | { kind: 'pinned'; tabs: SimpleTab[] }
  | { kind: 'group'; groupId: number; tabs: SimpleTab[] }
  | { kind: 'ungrouped'; tab: SimpleTab };

export type DropPos = 'before' | 'after';

export type MoveTabResult = {
  tabId: number;
  targetIndex: number;
  targetGroupId: number | undefined; // -1 = ungroup, undefined = keep current
};

export type MoveGroupResult = {
  groupId: number;
  targetIndex: number;
};

// ── 세그먼트 빌더 ──

export function buildSegments(
  tabs: SimpleTab[],
  groupIds: Set<number>, // 존재하는 그룹 ID 집합
): Segment[] {
  const sorted = [...tabs].sort((a, b) => a.index - b.index);
  const segments: Segment[] = [];

  const pinnedTabs = sorted.filter((t) => t.pinned);
  if (pinnedTabs.length > 0) {
    segments.push({ kind: 'pinned', tabs: pinnedTabs });
  }

  let currentGroupId: number | null = null;
  let currentGroupTabs: SimpleTab[] = [];

  for (const tab of sorted) {
    if (tab.pinned) continue;

    const gid = tab.groupId !== -1 ? tab.groupId : -1;

    if (gid !== -1 && groupIds.has(gid)) {
      if (gid === currentGroupId) {
        currentGroupTabs.push(tab);
      } else {
        // 이전 그룹 플러시
        if (currentGroupId !== null && currentGroupTabs.length > 0) {
          segments.push({ kind: 'group', groupId: currentGroupId, tabs: currentGroupTabs });
        }
        currentGroupId = gid;
        currentGroupTabs = [tab];
      }
    } else {
      // 미분류 탭
      if (currentGroupId !== null && currentGroupTabs.length > 0) {
        segments.push({ kind: 'group', groupId: currentGroupId, tabs: currentGroupTabs });
        currentGroupId = null;
        currentGroupTabs = [];
      }
      segments.push({ kind: 'ungrouped', tab });
    }
  }

  // 마지막 그룹 플러시
  if (currentGroupId !== null && currentGroupTabs.length > 0) {
    segments.push({ kind: 'group', groupId: currentGroupId, tabs: currentGroupTabs });
  }

  return segments;
}

// ── 드롭 위치 보정 ──

/**
 * 인접 탭 드롭 시 no-op이 되는 위치를 보정.
 *
 * chrome.tabs.move()는 "제거 후 삽입" 방식:
 * - src < target → adjusted = target - 1
 * - src >= target → adjusted = target
 *
 * no-op 케이스:
 * - src가 target 바로 위(src === tgt - 1)이고 pos='before' → adjusted = src → 제자리
 * - src가 target 바로 아래(src === tgt + 1)이고 pos='after' → adjusted = src → 제자리
 */
export function resolveDropPosition(
  srcIndex: number,
  tgtIndex: number,
  rawPos: DropPos,
): DropPos {
  if (srcIndex === tgtIndex - 1 && rawPos === 'before') return 'after';
  if (srcIndex === tgtIndex + 1 && rawPos === 'after') return 'before';
  return rawPos;
}

// ── 이동 대상 인덱스 계산 ──

/**
 * 탭을 다른 탭 위치로 이동할 때의 targetIndex 계산.
 * 이 값은 background의 moveTab에 전달됨 (background에서 adjust 처리).
 */
export function computeTabMoveTarget(
  dropTargetIndex: number,
  pos: DropPos,
): number {
  return pos === 'after' ? dropTargetIndex + 1 : dropTargetIndex;
}

/**
 * 탭을 그룹 헤더에 드롭할 때의 타겟 계산.
 * - 'into': 그룹의 마지막 탭 뒤에 추가
 * - 'before'/'after': 그룹 앞/뒤에 미분류로 배치
 */
export function computeTabToGroupTarget(
  groupTabs: SimpleTab[],
  pos: 'before' | 'after' | 'into',
): { targetIndex: number; targetGroupId: number | undefined } {
  const firstIdx = groupTabs[0]?.index ?? 0;
  const lastIdx = groupTabs[groupTabs.length - 1]?.index ?? 0;

  if (pos === 'into') {
    return { targetIndex: lastIdx + 1, targetGroupId: groupTabs[0]?.groupId };
  } else if (pos === 'before') {
    return { targetIndex: firstIdx, targetGroupId: -1 };
  } else {
    return { targetIndex: lastIdx + 1, targetGroupId: -1 };
  }
}

/**
 * chrome.tabs.move()의 "제거 후 삽입" 인덱스 보정을 시뮬레이션.
 * 실제로는 background에서 수행하지만, 테스트용으로 검증 가능.
 */
export function adjustIndexForMove(srcIndex: number, targetIndex: number): number {
  return srcIndex < targetIndex ? targetIndex - 1 : targetIndex;
}

/**
 * 이동 후 실제 최종 인덱스를 계산 (테스트 검증용).
 * srcIndex에 있는 탭이 targetIndex로 이동 요청 시 실제 위치.
 */
export function computeFinalPosition(srcIndex: number, targetIndex: number): number {
  return adjustIndexForMove(srcIndex, targetIndex);
}

/**
 * 이동이 실제로 위치 변경을 초래하는지 검증.
 */
export function willActuallyMove(srcIndex: number, targetIndex: number): boolean {
  return computeFinalPosition(srcIndex, targetIndex) !== srcIndex;
}
