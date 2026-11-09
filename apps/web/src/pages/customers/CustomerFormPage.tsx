import { customerDetailSchema } from "@nippo/shared";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { notifySuccess } from "@/components/notify";
import { api, isApiError } from "@/lib/api";
import { NotFoundPage } from "@/pages/NotFoundPage";

function FormCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="max-w-2xl rounded-xl border bg-card p-4 shadow-xs md:p-6">
      {children}
    </section>
  );
}

/** SCR-10 顧客登録 */
export function CustomerCreatePage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">顧客登録</h1>
      <FormCard>
        <CustomerForm
          onSaved={(customer) => {
            notifySuccess("顧客を登録しました");
            void navigate(`/customers/${customer.id}`);
          }}
          onCancel={() => void navigate("/customers")}
        />
      </FormCard>
    </div>
  );
}

/** SCR-10 顧客編集 */
export function CustomerEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const customerId = Number(id);
  const valid = Number.isInteger(customerId) && customerId > 0;
  const customer = useQuery({
    queryKey: ["customers", "detail", customerId],
    queryFn: ({ signal }) =>
      api.get(`/customers/${customerId}`, { schema: customerDetailSchema, signal }),
    enabled: valid,
  });

  if (!valid || (isApiError(customer.error) && customer.error.status === 404))
    return <NotFoundPage />;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">顧客編集</h1>
      {customer.isError ? (
        <p role="alert" className="text-destructive">
          顧客を読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : customer.data ? (
        <FormCard>
          <CustomerForm
            key={customer.data.id}
            customer={customer.data}
            onSaved={(saved) => {
              notifySuccess("顧客を保存しました");
              void navigate(`/customers/${saved.id}`);
            }}
            onCancel={() => void navigate(`/customers/${customerId}`)}
          />
        </FormCard>
      ) : (
        <p className="text-muted-foreground">読み込み中…</p>
      )}
    </div>
  );
}
