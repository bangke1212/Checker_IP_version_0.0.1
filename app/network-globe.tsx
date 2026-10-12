const latitudes = [-66, -48, -30, -12, 6, 24, 42, 60, 72];
const longitudes = [-78, -58, -38, -18, 2, 22, 42, 62, 78];
const centerX = 285;
const centerY = 190;

type GlobeNode = { lat: number; lon: number; x: number; y: number; depth: number };

function project(lat: number, lon: number): GlobeNode {
  const latitude = (lat * Math.PI) / 180;
  const longitude = (lon * Math.PI) / 180;
  const depth = Math.cos(latitude) * Math.cos(longitude);
  return {
    lat,
    lon,
    x: centerX + 177 * Math.cos(latitude) * Math.sin(longitude),
    y: centerY - 147 * Math.sin(latitude),
    depth,
  };
}

const nodes = latitudes.flatMap((lat) => longitudes.map((lon) => project(lat, lon))).filter((node) => node.depth > 0.08);
const nodeIndex = new Map(nodes.map((node) => [`${node.lat}:${node.lon}`, node]));
const edges = nodes.flatMap((node) => {
  const east = nodeIndex.get(`${node.lat}:${node.lon + 20}`);
  const north = nodeIndex.get(`${node.lat + 18}:${node.lon}`);
  return [east, north].filter((next): next is GlobeNode => Boolean(next)).map((next) => ({ from: node, to: next }));
});

export default function NetworkGlobe() {
  return (
    <svg className="network-globe" viewBox="0 0 570 380" role="presentation" focusable="false">
      <defs>
        <radialGradient id="globe-fill" cx="68%" cy="37%" r="72%">
          <stop offset="0%" stopColor="#0c8795" stopOpacity=".24" />
          <stop offset="55%" stopColor="#071f36" stopOpacity=".68" />
          <stop offset="100%" stopColor="#031321" stopOpacity=".08" />
        </radialGradient>
        <linearGradient id="globe-stroke" x1=".1" y1="0" x2=".95" y2="1">
          <stop offset="0%" stopColor="#2ce5ce" stopOpacity=".05" />
          <stop offset="54%" stopColor="#25dbd4" stopOpacity=".68" />
          <stop offset="100%" stopColor="#31a3f4" stopOpacity=".12" />
        </linearGradient>
        <filter id="globe-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id="globe-clip"><circle cx={centerX} cy={centerY} r="164" /></clipPath>
      </defs>

      <circle cx={centerX} cy={centerY} r="164" fill="url(#globe-fill)" />
      <circle cx={centerX} cy={centerY} r="164" fill="none" stroke="url(#globe-stroke)" strokeWidth="1.2" />
      <ellipse cx={centerX} cy={centerY} rx="164" ry="61" fill="none" stroke="#37c9d5" strokeOpacity=".14" />
      <ellipse cx={centerX} cy={centerY} rx="164" ry="112" fill="none" stroke="#37c9d5" strokeOpacity=".1" />
      <ellipse cx={centerX} cy={centerY} rx="68" ry="164" fill="none" stroke="#37c9d5" strokeOpacity=".12" />
      <ellipse cx={centerX} cy={centerY} rx="126" ry="164" fill="none" stroke="#37c9d5" strokeOpacity=".1" />

      <g clipPath="url(#globe-clip)">
        <g className="globe-connections">
          {edges.map(({ from, to }) => (
            <line key={`${from.lat}:${from.lon}-${to.lat}:${to.lon}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} opacity={Math.max(0.14, from.depth * 0.42)} />
          ))}
        </g>
        <g className="globe-nodes">
          {nodes.map((node) => (
            <circle key={`${node.lat}:${node.lon}`} cx={node.x} cy={node.y} r={node.depth > 0.75 ? 1.65 : 1.1} opacity={Math.max(0.16, node.depth * 0.92)} />
          ))}
          <circle cx="372" cy="192" r="4.4" className="globe-pulse" filter="url(#globe-glow)" />
          <circle cx="372" cy="192" r="11" fill="none" stroke="#45e8d4" strokeOpacity=".32" />
        </g>
      </g>
      <path d="M95 214c30 98 127 152 226 134" fill="none" stroke="#23d9d2" strokeOpacity=".15" strokeWidth="1" />
      <path d="M132 90c67-57 176-73 264-24" fill="none" stroke="#36b8f4" strokeOpacity=".12" strokeWidth="1" />
    </svg>
  );
}
