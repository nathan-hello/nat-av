import type { TypeSchema } from "@av/schema/types";
import { css, type Handle } from "remix/ui";

type DebugTypeProps = {
  type: TypeSchema;
};

export function DebugTypeSchema(handle: Handle<DebugTypeProps>) {
  return () => renderTypeSchema(handle.props.type);
}

export function renderTypeSchema(type: TypeSchema) {
  switch (type.kind) {
    case "primitive":
      return <span mix={[tokenStyle, primitiveStyle]}>{type.type}</span>;
    case "literal":
      return <span mix={[tokenStyle, literalStyle]}>{JSON.stringify(type.value)}</span>;
    case "reference":
      return <span mix={[tokenStyle, referenceStyle]}>{type.name}</span>;
    case "unknown":
      return <span mix={[tokenStyle, unknownStyle]}>{type.name ?? "unknown"}</span>;
    case "array":
      return (
        <span mix={typeRowStyle}>
          <span mix={tokenStyle}>array</span>
          <span mix={compactStyle}>{renderTypeSchema(type.items)}</span>
        </span>
      );
    case "tuple":
      return <span mix={tokenStyle}>[{type.items.map((item) => renderTypeSchema(item))}]</span>;
    case "union":
      return <span mix={typeRowStyle}>{type.members.map((member, index) => <span key={index}>{index > 0 ? <span mix={separatorStyle}>|</span> : null}{renderTypeSchema(member)}</span>)}</span>;
    case "object":
      return (
        <div mix={objectStyle}>
          <div mix={objectHeaderStyle}>
            <span mix={tokenStyle}>object</span>
            {type.name ? <span mix={referenceStyle}>{type.name}</span> : null}
          </div>
          {Object.keys(type.properties).length > 0 || Object.keys(type.methods).length > 0 ?
            <div mix={compactStyle}>
              {Object.entries(type.properties).length > 0 ?
                <div mix={sectionStyle}>
                  <div mix={sectionLabelStyle}>properties</div>
                  <div mix={fieldListStyle}>
                    {Object.entries(type.properties).map(([name, property]) => (
                      <div key={name} mix={fieldRowStyle}>
                        <div mix={fieldMetaStyle}>
                          <span mix={fieldNameStyle}>{name}</span>
                          {property.required ? null : <span mix={mutedStyle}>optional</span>}
                          {property.readonly ? <span mix={mutedStyle}>readonly</span> : null}
                        </div>
                        <div mix={fieldValueStyle}>{renderTypeSchema(property.type)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              : null}
              {Object.entries(type.methods).length > 0 ?
                <div mix={sectionStyle}>
                  <div mix={sectionLabelStyle}>methods</div>
                  <div mix={fieldListStyle}>
                    {Object.entries(type.methods).map(([name, method]) => (
                      <div key={name} mix={fieldRowStyle}>
                        <div mix={fieldMetaStyle}>
                          <span mix={fieldNameStyle}>{name}</span>
                        </div>
                        <div mix={methodBodyStyle}>
                          <div mix={paramsRowStyle}>
                            <span mix={mutedStyle}>(</span>
                            {method.params.length > 0 ? method.params.map((param, index) => (
                              <span key={param.name} mix={paramStyle}>
                                {index > 0 ? <span mix={separatorStyle}>,</span> : null}
                                <span mix={fieldNameStyle}>{param.name}</span>
                                {param.required ? null : <span mix={mutedStyle}>?</span>}
                                {param.defaultValue ? <span mix={mutedStyle}>={param.defaultValue}</span> : null}
                                <span mix={separatorStyle}>:</span>
                                {renderTypeSchema(param.type)}
                              </span>
                            )) : <span mix={mutedStyle}>void</span>}
                            <span mix={mutedStyle}>)</span>
                          </div>
                          <div mix={returnRowStyle}>
                            <span mix={mutedStyle}>=&gt;</span>
                            {renderTypeSchema(method.returns)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              : null}
            </div>
          : null}
        </div>
      );
  }
}

const tokenStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "3px 8px",
  borderRadius: "999px",
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#e2e8f0",
  fontSize: "11px",
  whiteSpace: "nowrap",
});
const primitiveStyle = css({ borderColor: "#1d4ed8", color: "#bfdbfe" });
const literalStyle = css({ borderColor: "#7c3aed", color: "#ddd6fe" });
const referenceStyle = css({ borderColor: "#0f766e", color: "#99f6e4" });
const unknownStyle = css({ borderColor: "#7c2d12", color: "#fed7aa" });
const typeRowStyle = css({ display: "inline-flex", gap: "6px", flexWrap: "wrap", alignItems: "center" });
const objectStyle = css({ display: "grid", gap: "10px" });
const objectHeaderStyle = css({ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" });
const compactStyle = css({ display: "grid", gap: "10px" });
const sectionStyle = css({ display: "grid", gap: "8px" });
const sectionLabelStyle = css({ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" });
const fieldListStyle = css({ display: "grid", gap: "8px" });
const fieldRowStyle = css({ display: "grid", gap: "6px", padding: "10px", borderRadius: "14px", background: "#020617", border: "1px solid #1e293b" });
const fieldMetaStyle = css({ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" });
const fieldNameStyle = css({ color: "#f8fafc", fontSize: "12px", fontWeight: "700" });
const fieldValueStyle = css({ display: "grid", gap: "6px" });
const methodBodyStyle = css({ display: "grid", gap: "8px" });
const paramsRowStyle = css({ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" });
const returnRowStyle = css({ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" });
const paramStyle = css({ display: "inline-flex", gap: "4px", flexWrap: "wrap", alignItems: "center" });
const separatorStyle = css({ color: "#64748b" });
const mutedStyle = css({ color: "#94a3b8", fontSize: "11px" });
