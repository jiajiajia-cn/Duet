const SRC: Record<string, string> = {
  happy: "/mascot/happy.png",
  hello: "/mascot/hello.png",
  sleep: "/mascot/sleep.png",
  cheer: "/mascot/cheer.png",
  read: "/mascot/read.png",
  peek: "/mascot/peek.png",
};

export type MascotPose = keyof typeof SRC;

/**
 * 线条小狗表情包。只在「线条小狗」主题下显示（.mascot 默认 display:none）。
 * 素材来自网络表情包，已去白底；仅个人使用，见 public/mascot/README.md。
 */
export default function Mascot({
  className = "",
  pose = "happy",
  style,
}: {
  className?: string;
  pose?: MascotPose;
  style?: React.CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC[pose] ?? SRC.happy}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={style}
    />
  );
}
