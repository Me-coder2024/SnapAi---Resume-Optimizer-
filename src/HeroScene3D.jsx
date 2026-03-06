import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ═══════════════════════════════════════
   WIREFRAME GRID — 3D matrix/mesh surface
   ═══════════════════════════════════════ */
const WireGrid = () => {
    const ref = useRef()

    useFrame(s => {
        if (ref.current) {
            ref.current.rotation.x = -Math.PI / 3 + Math.sin(s.clock.elapsedTime * 0.15) * 0.05
            ref.current.rotation.z = s.clock.elapsedTime * 0.02
        }
    })

    return (
        <group ref={ref} position={[0, -1.5, 0]}>
            <gridHelper
                args={[30, 40, '#ffffff', '#ffffff']}
                material-transparent={true}
                material-opacity={0.06}
            />
            {/* Second grid slightly offset for depth */}
            <gridHelper
                args={[30, 20, '#ffffff', '#ffffff']}
                position={[0, 0.5, 0]}
                material-transparent={true}
                material-opacity={0.03}
            />
        </group>
    )
}

/* ═══════════════════════════════════════
   FLOATING SPHERE — White sphere bobbing up/down
   ═══════════════════════════════════════ */
const FloatingSphere = ({ position, radius, speed, amplitude, phaseOffset }) => {
    const ref = useRef()
    const startY = position[1]

    useFrame(s => {
        if (ref.current) {
            const t = s.clock.elapsedTime * speed + phaseOffset
            ref.current.position.y = startY + Math.sin(t) * amplitude
            ref.current.rotation.y = s.clock.elapsedTime * 0.3
            ref.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.2 + phaseOffset) * 0.2
        }
    })

    return (
        <mesh ref={ref} position={position}>
            <sphereGeometry args={[radius, 32, 32]} />
            <meshStandardMaterial
                color="#ffffff"
                transparent
                opacity={0.12}
                wireframe
                wireframeLinewidth={1}
            />
            {/* Inner solid sphere for soft glow core */}
            <mesh>
                <sphereGeometry args={[radius * 0.4, 24, 24]} />
                <meshStandardMaterial
                    color="#ffffff"
                    transparent
                    opacity={0.06}
                    emissive="#ffffff"
                    emissiveIntensity={0.3}
                />
            </mesh>
        </mesh>
    )
}

/* ═══════════════════════════════════════
   SUBTLE DOTS — Small floating particles
   ═══════════════════════════════════════ */
const Particles = () => {
    const count = 120
    const positions = useMemo(() => {
        const p = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
            p[i * 3] = (Math.random() - 0.5) * 20
            p[i * 3 + 1] = (Math.random() - 0.5) * 12
            p[i * 3 + 2] = -1 - Math.random() * 8
        }
        return p
    }, [])

    return (
        <points>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial size={0.02} color="#ffffff" transparent opacity={0.15} sizeAttenuation />
        </points>
    )
}

/* ═══════════════════════════════════════
   MAIN SCENE
   ═══════════════════════════════════════ */
const HeroScene3D = () => (
    <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
    }}>
        <Canvas
            camera={{ position: [0, 2, 8], fov: 50 }}
            dpr={[1, 1.5]}
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
            style={{ background: 'transparent' }}
        >
            <ambientLight intensity={0.15} />
            <pointLight position={[5, 8, 5]} intensity={0.3} color="#ffffff" />
            <pointLight position={[-5, -3, 3]} intensity={0.15} color="#ffffff" />

            {/* Wireframe grid matrix */}
            <WireGrid />

            {/* 3 floating white spheres */}
            <FloatingSphere position={[-2.5, 1.5, 0]} radius={0.6} speed={0.8} amplitude={0.8} phaseOffset={0} />
            <FloatingSphere position={[1.8, 0.5, -1]} radius={0.45} speed={1.0} amplitude={1.0} phaseOffset={2.1} />
            <FloatingSphere position={[0.2, 2.2, -0.5]} radius={0.35} speed={0.9} amplitude={0.6} phaseOffset={4.2} />

            {/* Subtle particles */}
            <Particles />
        </Canvas>
    </div>
)

export default HeroScene3D
