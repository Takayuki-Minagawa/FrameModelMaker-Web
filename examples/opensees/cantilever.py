"""Independent OpenSees cantilever check in cm/kN; requires openseespy.

Run from the repository root: python examples/opensees/cantilever.py
"""
import json
from pathlib import Path
import openseespy.opensees as ops
from export_results import capture

ops.wipe()
ops.model('basic', '-ndm', 3, '-ndf', 6)
ops.node(1, 0, 0, 0)
ops.node(2, 100, 0, 0)
ops.fix(1, 1, 1, 1, 1, 1, 1)
ops.geomTransf('Linear', 1, 0, 0, 1)
ops.element('elasticBeamColumn', 1, 1, 2, 10, 20000, 8000, 100, 50, 50, 1)
ops.timeSeries('Linear', 1)
ops.pattern('Plain', 1, 1)
ops.load(2, 0, -1, 0, 0, 0, 0)
ops.constraints('Plain')
ops.numberer('Plain')
ops.system('BandGeneral')
ops.integrator('LoadControl', 1)
ops.algorithm('Linear')
ops.analysis('Static')
if ops.analyze(1) != 0:
    raise RuntimeError('Analysis did not converge')
assert abs(ops.nodeDisp(2)[1] + 1/3) < 1e-10
assert abs(ops.nodeDisp(2)[5] + .005) < 1e-10
binding = json.loads(Path('public/samples/contracts/binding.json').read_text())
result = capture(ops, binding, {1: {'type': 'elasticBeamColumn3D', 'transform': 'Linear', 'vecxz': [0, 0, 1], 'jointOffsets': False, 'releases': False}}, title='OpenSees cantilever')
assert abs(result['frames'][0]['nodes'][0]['reaction'][1] - 1) < 1e-10
assert abs(result['frames'][0]['nodes'][0]['reaction'][5] - 100) < 1e-10
Path('/tmp/framemodelmaker-opensees-result.json').write_text(json.dumps(result, indent=2))
print('Cantilever displacement, rotation and equilibrium passed; result: /tmp/framemodelmaker-opensees-result.json')
