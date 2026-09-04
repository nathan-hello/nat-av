import { getRpc } from "@/state";
import {
  clientEntry,
  css,
  on,
  type Handle,
  type SerializableProps,
} from "remix/ui";

interface RelayBoardPageProps extends SerializableProps {}

export const RelayBoardPage = clientEntry(
  "/assets/app/ui/relay-board/index.tsx#RelayBoardPage",
  function RelayBoardPage(handle: Handle<RelayBoardPageProps>) {
    const rpc = getRpc(handle, "relay-board");

    function open(relay: number) {
      void rpc.api.open(relay);
    }

    function close(relay: number) {
      void rpc.api.close(relay);
    }

    return () => (
      <main mix={pageStyle}>
        <header>
          <p mix={eyebrowStyle}>Bewinner relay board</p>
          <h1 mix={titleStyle}>Relay control</h1>
        </header>
        <div mix={relayGridStyle}>
          {Array.from({ length: 16 }, (_, index) => {
            const relay = index + 1;
            const closed = rpc.state.closed?.[index] ?? false;

            return (
              <div key={relay} mix={relayStyle}>
                <div mix={relayHeaderStyle}>
                  <strong>Relay {relay}</strong>
                  <span mix={statusStyle(closed)}>
                    {closed ? "Closed" : "Open"}
                  </span>
                </div>
                <div mix={buttonRowStyle}>
                  <button
                    type="button"
                    mix={[
                      buttonStyle,
                      openButtonStyle,
                      on("click", () => open(relay)),
                    ]}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    mix={[
                      buttonStyle,
                      closeButtonStyle,
                      on("click", () => close(relay)),
                    ]}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    mix={[
                      buttonStyle,
                      holdButtonStyle,
                      on("pointerdown", (event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        close(relay);
                      }),
                      on("pointerup", () => open(relay)),
                      on("pointercancel", () => open(relay)),
                      on("pointerleave", () => open(relay)),
                    ]}
                  >
                    Hold
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    );
  },
);

const pageStyle = css({ padding: "24px", display: "grid", gap: "24px" });
const eyebrowStyle = css({
  margin: 0,
  color: "#f59e0b",
  fontSize: "12px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
});
const titleStyle = css({ margin: "6px 0 0", fontSize: "32px" });
const relayGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
});
const relayStyle = css({
  display: "grid",
  gap: "16px",
  padding: "16px",
  border: "1px solid #334155",
  borderRadius: "12px",
  background: "#111827",
});
const relayHeaderStyle = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "8px",
  color: "white"
});
const statusStyle = (closed: boolean) =>
  css({
    color: closed ? "#fca5a5" : "#86efac",
    fontSize: "12px",
    textTransform: "uppercase",
  });
const buttonRowStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
});
const buttonStyle = css({
  appearance: "none",
  flex: "1 1 96px",
  minHeight: "56px",
  padding: "14px 16px",
  border: "2px solid transparent",
  borderRadius: "10px",
  font: "inherit",
  fontSize: "16px",
  fontWeight: "700",
  lineHeight: "1.2",
  cursor: "pointer",
  touchAction: "manipulation",
  transition: "background-color 150ms ease, transform 100ms ease",
  "&:hover, &:focus-visible": {
    outline: "3px solid #f8fafc",
    outlineOffset: "2px",
  },
  "&:active": { transform: "translateY(1px)" },
});
const openButtonStyle = css({
  background: "#38bdf8",
  color: "#082f49",
  "&:hover, &:focus-visible": { background: "#7dd3fc" },
});
const closeButtonStyle = css({
  background: "#fb7185",
  color: "#4c0519",
  "&:hover, &:focus-visible": { background: "#fda4af" },
});
const holdButtonStyle = css({
  background: "#fbbf24",
  color: "#422006",
  "&:hover, &:focus-visible": { background: "#fcd34d" },
});
