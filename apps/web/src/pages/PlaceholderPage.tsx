import { useParams } from "react-router";

type Props = {
  screenId: string;
  name: string;
};

/** 画面を作るまでの仮のページ */
export function PlaceholderPage({ screenId, name }: Props) {
  const { id } = useParams();
  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-xl font-bold">
        {screenId} {name}
      </h1>
      {id && <p className="mt-2 text-muted-foreground">ID: {id}</p>}
      <p className="mt-4 text-sm text-muted-foreground">この画面は準備中です。</p>
    </main>
  );
}
