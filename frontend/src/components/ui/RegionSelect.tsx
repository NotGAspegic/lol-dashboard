interface RegionSelectProps {
  value: string;
  onChange: (value: string) => void;
}

const REGIONS = [
  { label: "EUW", value: "euw1" },
  { label: "EUNE", value: "eun1" },
  { label: "NA", value: "na1" },
  { label: "KR", value: "kr" },
  { label: "BR", value: "br1" },
  { label: "JP", value: "jp1" },
];

export default function RegionSelect({ value, onChange }: RegionSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-surface2 border border-primary/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 cursor-pointer"
    >
      {REGIONS.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}