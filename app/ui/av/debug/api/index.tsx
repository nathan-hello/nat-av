import type { ApiSurfaceSchema } from "@av/schema/types";
import type { Handle } from "remix/ui";
import { css } from "remix/ui";
import { renderTypeSchema } from "./parse";

type DebugSchemaPanelProps = {
  schema: ApiSurfaceSchema | undefined;
};

export function DebugSchemaPanel(handle: Handle<DebugSchemaPanelProps>) {
  return () => {
    const schema = handle.props.schema;

    return (
      <section mix={panelStyle}>
        <div mix={panelHeaderStyle}>
          <div>
            <h2 mix={panelTitleStyle}>Schema</h2>
            <p mix={panelSubtitleStyle}>RPC surface generated from @av/schema.</p>
          </div>
        </div>

        {schema ? (
          <div mix={schemaBodyStyle}>
            <div mix={summaryStyle}>
              <div>
                <span mix={labelStyle}>entry</span>
                <div>{schema.entry.filePath}</div>
              </div>
              <div>
                <span mix={labelStyle}>type</span>
                <div>{schema.typeName}</div>
              </div>
              <div>
                <span mix={labelStyle}>source</span>
                <div>{schema.source.symbolName ?? "unknown"}</div>
              </div>
            </div>

            <div mix={schemaSectionStyle}>
              <div mix={sectionLabelStyle}>properties</div>
              <div mix={listStyle}>
                {Object.entries(schema.properties).map(([name, property]) => (
                  <div key={name} mix={itemStyle}>
                    <div mix={itemHeaderStyle}>
                      <span mix={fieldNameStyle}>{name}</span>
                      {property.required ? null : <span mix={mutedStyle}>optional</span>}
                      {property.readonly ? <span mix={mutedStyle}>readonly</span> : null}
                    </div>
                    <div>{renderTypeSchema(property.type)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div mix={schemaSectionStyle}>
              <div mix={sectionLabelStyle}>methods</div>
              <div mix={listStyle}>
                {Object.entries(schema.methods).map(([name, method]) => (
                  <div key={name} mix={itemStyle}>
                    <div mix={itemHeaderStyle}>
                      <span mix={fieldNameStyle}>{name}</span>
                    </div>
                    <div mix={methodRowStyle}>
                      <div mix={paramsStyle}>
                        <span mix={mutedStyle}>(</span>
                        {method.params.length > 0 ? method.params.map((param, index) => (
                          <span key={param.name} mix={paramStyle}>
                            {index > 0 ? <span mix={separatorStyle}>,</span> : null}
                            <span>{param.name}</span>
                            {param.required ? null : <span mix={mutedStyle}>?</span>}
                            {param.defaultValue ? <span mix={mutedStyle}>={param.defaultValue}</span> : null}
                            <span mix={separatorStyle}>:</span>
                            {renderTypeSchema(param.type)}
                          </span>
                        )) : <span mix={mutedStyle}>void</span>}
                        <span mix={mutedStyle}>)</span>
                      </div>
                      <div mix={returnStyle}>
                        <span mix={mutedStyle}>=&gt;</span>
                        {renderTypeSchema(method.returns)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p mix={emptyStyle}>Waiting for debug schema...</p>
        )}
      </section>
    );
  };
}

const panelStyle = css({
  background: "#020617",
  border: "1px solid #1e293b",
  borderRadius: "18px",
  padding: "18px",
  display: "grid",
  gap: "14px",
});
const panelHeaderStyle = css({ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" });
const panelTitleStyle = css({ margin: 0, fontSize: "18px" });
const panelSubtitleStyle = css({ margin: "6px 0 0", color: "#94a3b8", fontSize: "13px" });
const schemaBodyStyle = css({ display: "grid", gap: "14px" });
const summaryStyle = css({ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", color: "#e2e8f0" });
const labelStyle = css({ display: "block", marginBottom: "4px", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" });
const schemaSectionStyle = css({ display: "grid", gap: "8px" });
const sectionLabelStyle = css({ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" });
const listStyle = css({ display: "grid", gap: "8px" });
const itemStyle = css({ display: "grid", gap: "8px", padding: "10px", borderRadius: "14px", border: "1px solid #1e293b", background: "#0f172a" });
const itemHeaderStyle = css({ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" });
const fieldNameStyle = css({ color: "#f8fafc", fontSize: "12px", fontWeight: "700" });
const mutedStyle = css({ color: "#94a3b8", fontSize: "11px" });
const methodRowStyle = css({ display: "grid", gap: "8px" });
const paramsStyle = css({ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" });
const returnStyle = css({ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" });
const paramStyle = css({ display: "inline-flex", gap: "4px", flexWrap: "wrap", alignItems: "center" });
const separatorStyle = css({ color: "#64748b" });
const emptyStyle = css({ margin: 0, color: "#64748b" });
