"""Capture static 3D elasticBeamColumn results using an analysis-time binding.

Call capture after a successful analyze() step. Keep the original binding alongside
that analysis; never replace its fingerprint with one from a later edited model.
The caller supplies the actual Linear transformation vector used to build each
beam. Joint offsets, releases, PDelta/corotational and other elements are excluded.
"""
import copy
import math


def _vector(values, size):
    result = list(values)
    if len(result) != size or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in result):
        raise ValueError(f"Expected {size} finite values")
    return result


def _cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def _unit(a):
    norm = math.sqrt(sum(v*v for v in a))
    if norm < 1e-12:
        raise ValueError("Degenerate local axis")
    return [v/norm for v in a]


def capture(ops, binding, element_contracts, *, length="cm", force="kN", title="OpenSees", load_case_id=None):
    """Return recorder-v1 JSON data; node/element tags come from binding.

    element_contracts[tag] must describe the actual model construction:
    {"type": "elasticBeamColumn3D", "transform": "Linear", "vecxz": [x,y,z],
     "jointOffsets": False, "releases": False}.
    Binding coordinates are always cm; returned recorder coordinates use length.
    """
    if binding.get("format") != "framemodelmaker-binding-v1":
        raise ValueError("Unsupported binding")
    scale = {"cm": 1, "mm": .1, "m": 100}.get(length)
    if scale is None or force not in ("N", "kN"):
        raise ValueError("Unsupported units")
    nodes = copy.deepcopy(binding["nodes"])
    for node in nodes:
        actual = _vector(ops.nodeCoord(node["tag"]), 3)
        if any(not math.isclose(a*scale, b, rel_tol=1e-9, abs_tol=1e-7) for a, b in zip(actual, node["coordinates"])):
            raise ValueError("Solver coordinates differ from analysis binding")
        node["coordinates"] = actual
    by_tag = {n["tag"]: n for n in nodes}
    members = copy.deepcopy(binding["members"])
    for member in members:
        contract = element_contracts[member["tag"]]
        if (contract.get("type") != "elasticBeamColumn3D" or contract.get("transform") != "Linear"
                or contract.get("jointOffsets") is not False or contract.get("releases") is not False):
            raise ValueError("Unsupported element construction")
        if list(ops.eleNodes(member["tag"])) != [member["nodeI"], member["nodeJ"]]:
            raise ValueError("Solver connectivity differs from analysis binding")
        i, j = (by_tag[member[k]]["coordinates"] for k in ("nodeI", "nodeJ"))
        x = _unit([b-a for a, b in zip(i, j)])
        y = _unit(_cross(_vector(contract["vecxz"], 3), x))
        if any(abs(a-b) > 1e-7 for a, b in zip(y, member["localY"])):
            raise ValueError("Solver orientation differs from analysis binding")
        member["type"] = "elasticBeamColumn3D"
        member["localY"] = y
    ops.reactions()
    frame = {"time": float(ops.getTime()), "nodes": [
        {"tag": n["tag"], "displacement": _vector(ops.nodeDisp(n["tag"]), 6),
         "reaction": _vector(ops.nodeReaction(n["tag"]), 6)} for n in nodes], "members": [
        {"tag": m["tag"], "localForce": _vector(ops.eleResponse(m["tag"], "localForce"), 12)} for m in members]}
    result = {"format": "opensees-recorder-v1", "forceConvention": "local-end-resisting",
              "modelFingerprint": binding["modelFingerprint"], "title": title,
              "units": {"length": length, "force": force, "time": "s"},
              "nodes": nodes, "members": members, "frames": [frame]}
    if load_case_id is not None:
        result["loadCaseId"] = load_case_id
    return result
