import React from 'react';
import {
    SiUbuntu,
    SiDebian,
    SiFedora,
    SiArchlinux,
    SiAlpinelinux,
    SiRaspberrypi,
    SiRedhat,
    SiCentos,
    SiOpensuse,
    SiLinux
} from 'react-icons/si';

const DistroIcon = ({ distro, size = 16 }) => {
    const iconProps = { size, style: { flexShrink: 0 } };
    const icons = {
        ubuntu: <SiUbuntu color="#E95420" {...iconProps} />,
        debian: <SiDebian color="#A81D33" {...iconProps} />,
        fedora: <SiFedora color="#294172" {...iconProps} />,
        arch: <SiArchlinux color="#1793D1" {...iconProps} />,
        archlinux: <SiArchlinux color="#1793D1" {...iconProps} />,
        alpine: <SiAlpinelinux color="#0D597F" {...iconProps} />,
        alpinelinux: <SiAlpinelinux color="#0D597F" {...iconProps} />,
        raspbian: <SiRaspberrypi color="#C51A4A" {...iconProps} />,
        raspberrypi: <SiRaspberrypi color="#C51A4A" {...iconProps} />,
        redhat: <SiRedhat color="#EE0000" {...iconProps} />,
        centos: <SiCentos color="#262577" {...iconProps} />,
        opensuse: <SiOpensuse color="#73BA25" {...iconProps} />,
        linux: <SiLinux color="#333333" {...iconProps} />
    };

    const icon = icons[distro] || icons.linux;

    return (
        <div style={{
            width: size + 8,
            height: size + 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: '8px'
        }}>
            {icon}
        </div>
    );
};

export default DistroIcon;
