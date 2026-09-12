/**
 * Ngọn núi "register" — một vật thể trên bản đồ chính, cùng một lớp với
 * `ForestRing`/`FlowingStream` (task 40, thiết kế lại: không còn là canvas
 * HUD nổi góc màn hình, xem `RegisterMountainScenery.tsx`).
 */
export const REGISTER_MOUNTAIN = {
  /** Đỉnh chính: cone 6 mặt, flat-shaded, cùng ngôn ngữ low-poly với ForestRing. */
  peak: { radius: 1.6, height: 2.6, segments: 6 },
  /** Chóp tuyết: cone nhỏ hơn đặt ở `snowStartRatio` chiều cao đỉnh. */
  snow: { radiusScale: 0.46, heightScale: 0.42, snowStartRatio: 0.58 },
  /** Hai đỉnh phụ tạo rặng, lệch vị trí để silhouette không đối xứng. */
  foothills: [
    { offset: [-0.82, 0, 0.42] as [number, number, number], scale: 0.54, rotationY: 0.7 },
    { offset: [0.78, 0, -0.3] as [number, number, number], scale: 0.42, rotationY: -1.1 },
  ],
  /** Bệ hex bên dưới — dùng lại `hexGeometry`, thu nhỏ, để núi "thuộc về" cùng thế giới. */
  plinth: { scale: 0.62, y: -0.02 },
  hoverLiftY: 0.12,
  /** Hằng số thời gian ease (giây) cho lift/scale khi hover & press. */
  easeSeconds: 0.12,
  pressScale: 0.94,
  /** Chu kỳ nhấp nháy chóp tuyết khi có pledge đang treo (`hasStoredClaim`). */
  pendingPulseSeconds: 1.6,
  /** Khoảng hở giữa đỉnh núi và nameplate DOM phía trên — cùng vai trò `nameplateClearance` của `shapeKit`. */
  nameplateClearance: 0.6,
  /**
   * Vị trí trong world-space của map chính — núi là một vật thể trên bản đồ,
   * giống `ForestRing`/`FlowingStream`, không phải HUD nổi trên màn hình.
   * Đặt theo góc + số hex trống ngoài rìa lưới hiện tại (`worldRadius`, đọc
   * reactive từ store, không phải hằng số `WORLD_RADIUS`) để núi luôn đứng
   * ngoài lưới hex dù ví sở hữu bao nhiêu tên.
   */
  placement: {
    /** Hướng đông-nam — cùng phía núi từng neo khi còn là HUD góc màn hình. */
    angleRad: -Math.PI / 3.4,
    /** Số hex trống thêm ngoài hex ngoài cùng của lưới. */
    edgeMarginHexes: 2.4,
    /** Xấp xỉ world-units mỗi hex ring, cùng hệ số `hexToWorld` dùng cho một bước ra ngoài. */
    ringSpacingWorldUnits: 1.5,
    /** Núi cần đọc như một mốc địa hình rõ rệt giữa các lâu đài — cố tình lớn hơn một lâu đài Sovereign để không bị lạc giữa các castle. */
    worldScale: 3.4,
  },
} as const;
