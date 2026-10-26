"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkInAction, undoCheckinAction } from "@/app/actions/checkin";

/**
 * 打卡按钮。
 * 用 <form action={serverAction}> 保证无 JS 时也能提交，
 * 但有 JS 时自己接管：调用完成后主动 router.refresh()，
 * 避免出现「点了没反应、要手动刷新」。
 */
export default function CheckButton({
  habitId,
  done,
}: {
  habitId: string;
  done: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const action = done ? undoCheckinAction : checkInAction;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("habitId", habitId);
        start(async () => {
          await action(fd);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="habitId" value={habitId} />
      <button
        type="submit"
        className={`check${done ? " done" : ""}${pending ? " pending" : ""}`}
        aria-label={done ? "撤销打卡" : "打卡"}
        title={done ? "点一下撤销" : "打卡"}
        disabled={pending}
      >
        {done ? "✓" : ""}
      </button>
    </form>
  );
}
