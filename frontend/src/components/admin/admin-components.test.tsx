import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ApiError } from "../../services/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeleteDialog } from "./DeleteDialog";
import { diffPatch } from "./patch";
import { RowActions } from "./RowActions";
import { ShowArchivedToggle } from "./ShowArchivedToggle";

describe("ConfirmDialog", () => {
  const setup = () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Eliminar producto" message="¿Seguro?" confirmLabel="Eliminar" onConfirm={onConfirm} onCancel={onCancel} />);
    return { onConfirm, onCancel };
  };

  it("confirmar llama a la acción", async () => {
    const { onConfirm, onCancel } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancelar y Esc no llaman a la acción", async () => {
    const { onConfirm, onCancel } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("es un diálogo modal con título y atrapa el foco con Tab", async () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Eliminar producto" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });
});

type Row = { id: number; name: string; archived: boolean };

function Harness({ remove, archive }: { remove: (id: number) => Promise<unknown>; archive: (id: number) => Promise<unknown> }) {
  const [rows, setRows] = useState<Row[]>([
    { id: 1, name: "Camiseta", archived: false },
    { id: 2, name: "Gorra", archived: true },
  ]);
  const [showArchived, setShowArchived] = useState(false);
  const [target, setTarget] = useState<Row | null>(null);
  const visible = rows.filter((r) => showArchived || !r.archived);
  return (
    <div>
      <ShowArchivedToggle checked={showArchived} onChange={setShowArchived} />
      <ul>
        {visible.map((r) => (
          <li key={r.id}>
            {r.name}
            <RowActions name={r.name} archived={r.archived} onDelete={() => setTarget(r)} onArchive={() => undefined} onRestore={() => undefined} onEdit={() => undefined} />
          </li>
        ))}
      </ul>
      <DeleteDialog
        target={target}
        noun="producto"
        remove={() => remove(target!.id)}
        archive={() => archive(target!.id)}
        onClose={() => setTarget(null)}
        onDone={(outcome) => {
          setRows((all) => (outcome === "deleted" ? all.filter((r) => r.id !== target!.id) : all.map((r) => (r.id === target!.id ? { ...r, archived: true } : r))));
          setTarget(null);
        }}
      />
    </div>
  );
}

describe("DeleteDialog", () => {
  it("eliminar → confirmación → DELETE → la fila desaparece", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    render(<Harness remove={remove} archive={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar Camiseta" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.queryByText("Camiseta")).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledWith(1);
  });

  it("409 RESOURCE_IN_USE muestra el mensaje del backend y ofrece «Archivar en su lugar»", async () => {
    const message = "Este producto aparece en 3 pedidos. Puedes archivarlo para ocultarlo de la tienda.";
    const remove = vi.fn().mockRejectedValue(new ApiError(409, "RESOURCE_IN_USE", message, { orders: 3 }));
    const archive = vi.fn().mockResolvedValue(undefined);
    render(<Harness remove={remove} archive={archive} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar Camiseta" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archivar en su lugar" }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("otros errores se muestran sin ofrecer archivar", async () => {
    const remove = vi.fn().mockRejectedValue(new ApiError(500, "http_error", "Falló el servidor."));
    render(<Harness remove={remove} archive={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar Camiseta" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByText("Falló el servidor.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar en su lugar" })).not.toBeInTheDocument();
  });
});

describe("ShowArchivedToggle y RowActions", () => {
  it("«Mostrar archivados» muestra y oculta los elementos archivados", async () => {
    render(<Harness remove={vi.fn()} archive={vi.fn()} />);
    expect(screen.queryByText("Gorra")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar archivados" }));
    expect(screen.getByText("Gorra")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restaurar Gorra" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar Gorra" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar archivados" }));
    expect(screen.queryByText("Gorra")).not.toBeInTheDocument();
  });

  it("solo muestra las acciones que reciben handler", () => {
    render(<RowActions name="Pedido" onEdit={() => undefined} />);

    expect(screen.getByRole("button", { name: "Editar Pedido" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar Pedido" })).not.toBeInTheDocument();
  });
});

describe("diffPatch", () => {
  it("devuelve solo los campos modificados", () => {
    const initial = { name: "Camiseta", price: 100, tags: ["a"], note: null as string | null };

    expect(diffPatch(initial, { ...initial, price: 120 })).toEqual({ price: 120 });
    expect(diffPatch(initial, { ...initial, tags: ["a", "b"], note: "x" })).toEqual({ tags: ["a", "b"], note: "x" });
    expect(diffPatch(initial, { ...initial })).toEqual({});
  });
});
