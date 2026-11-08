import { useParams } from "react-router";

type Props = {
  screenId: string;
  name: string;
};

/** 画面を作るまでの仮のページ */
export function PlaceholderPage({ screenId, name }: Props) {
  const { id } = useParams();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-bold">
        {screenId} {name}
      </h1>
      {id && <p className="text-muted-foreground">ID: {id}</p>}
      <p className="text-sm text-muted-foreground">この画面は準備中です。</p>
    </div>
  );
}
