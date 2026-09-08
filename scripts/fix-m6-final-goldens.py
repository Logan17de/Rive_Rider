from pathlib import Path
p = Path('tests/veyra-golden.test.mjs')
t = p.read_text(encoding='utf-8')
updates = {
    'aa989c4bf157db1ae2b11e36d01d4601bc84e8e329f402a1b478ccc37e08b670': '04980c87cf6db93d8d4ef3ae0633dd89809abe712fd29ce1b59bbe04368b0efb',
    '8819fbbbd1712fb3c6063589c33368926675018cfd95cc7a9336d7d22ba86ace': 'c177f9797a74651fde492f2c309142c2ee5cdcea2d0a8d53452bbff2e10bfbad',
    'e514408bcbce113b1db5f93f9f89c2d9b2fc1892ee362dcba68e533852f40db1': 'eda12d677ed250d5a81aef6a4ecfab393e7397871a9c174ad6280c2a53b3cb02',
    '59ef23a11dfeffa08be8970113bfcc958d2d51e3cfdb09515975e13d7408492f': '0417f670c8b94e6f158f45f8324c8650f96323860ea2930de5b4b430cbc26fe1',
    'a036c47d8b51da8f6699d04f1185721ad39970897e7b2a1e47333cf8ae4aeef2': '250641d4671a89086d7e02369ef244d7958e800737a5c0a9ca11368da2616531',
    'dca81ba512028470b426ffb7022c190f05b1f3b2b65e4593cfe9edc2c469afca': '7752ef4810a1f6c0f0d776335f27de5a641d454bfa553c7ac5ec19dccb7518ae',
}
for old, new in updates.items():
    if old not in t:
        raise SystemExit(f'missing golden hash {old}')
    t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('M6 authored-stroke SVG goldens updated')
