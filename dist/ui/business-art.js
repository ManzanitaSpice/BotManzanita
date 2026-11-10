import { createCanvas } from '@napi-rs/canvas';
import { businessJobs } from '../services/economy.js';
const scenes = {
    minero: { sky: '#142238', accent: '#76d2ff', ground: '#263544', roof: '#536779', shape: 'Mina de veta profunda' },
    lenador: { sky: '#1b382f', accent: '#9ed977', ground: '#334b35', roof: '#805a37', shape: 'Aserradero del bosque' },
    agricultor: { sky: '#334d38', accent: '#f2d46c', ground: '#526443', roof: '#8a6338', shape: 'Granja de temporada' },
    repartidor: { sky: '#293b61', accent: '#7bd4ff', ground: '#3f4c5d', roof: '#426da3', shape: 'Centro de reparto' },
    cocinero: { sky: '#583648', accent: '#ffc06c', ground: '#58473f', roof: '#9a5948', shape: 'Restaurante de barrio' },
    pescador: { sky: '#173e58', accent: '#8bd9f2', ground: '#315b68', roof: '#4a7382', shape: 'Muelle pesquero' },
    ladron: { sky: '#261b3a', accent: '#c797ff', ground: '#40334e', roof: '#705187', shape: 'Casa de empeño La Sombra' },
    detective: { sky: '#1d2d44', accent: '#f0c76b', ground: '#35465b', roof: '#526a86', shape: 'Agencia de investigación' },
};
export function renderBusinessBackdrop(jobId, status = 'land', level = 1) {
    const width = 960;
    const height = 340;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const scene = jobId ? scenes[jobId] : undefined;
    const sky = scene?.sky ?? '#24324b';
    const accent = scene?.accent ?? '#a6c6f4';
    const ground = scene?.ground ?? '#465342';
    const roof = scene?.roof ?? '#667284';
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, sky);
    skyGradient.addColorStop(1, '#121a28');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 8; i++) {
        const x = i * 150 - 40;
        ctx.fillStyle = i % 2 ? '#7790a9' : '#405771';
        ctx.beginPath();
        ctx.moveTo(x, 245);
        ctx.lineTo(x + 88, 100 + (i % 3) * 25);
        ctx.lineTo(x + 180, 245);
        ctx.closePath();
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.moveTo(0, 239);
    ctx.quadraticCurveTo(260, 210, 480, 243);
    ctx.quadraticCurveTo(720, 270, 960, 224);
    ctx.lineTo(960, 340);
    ctx.lineTo(0, 340);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(8,15,24,.34)';
    ctx.fillRect(0, 278, width, 62);
    if (status === 'land') {
        ctx.fillStyle = 'rgba(219,234,254,.22)';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 9]);
        ctx.strokeRect(365, 155, 235, 118);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(482, 218, 18, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.fillStyle = '#152235';
        ctx.fillRect(478, 204, 8, 28);
        ctx.fillRect(468, 214, 28, 8);
        ctx.font = '700 18px Arial, sans-serif';
        ctx.fillStyle = '#f4f7fb';
        ctx.textAlign = 'center';
        ctx.fillText('LOTE DISPONIBLE', 482, 304);
    }
    else {
        const buildingX = 352;
        const buildingY = 148;
        const buildingW = 260;
        const buildingH = 133;
        ctx.fillStyle = '#1b2533';
        ctx.fillRect(buildingX - 11, buildingY + 4, buildingW + 22, buildingH + 3);
        ctx.fillStyle = status === 'construction' ? '#76808d' : status === 'closed' ? '#6b6060' : '#c1c8d0';
        ctx.fillRect(buildingX, buildingY + 32, buildingW, buildingH);
        ctx.fillStyle = roof;
        ctx.beginPath();
        ctx.moveTo(buildingX - 20, buildingY + 38);
        ctx.lineTo(buildingX + buildingW / 2, buildingY - 36);
        ctx.lineTo(buildingX + buildingW + 20, buildingY + 38);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#26374b';
        ctx.fillRect(buildingX + 25, buildingY + 58, 60, 53);
        ctx.fillRect(buildingX + 175, buildingY + 58, 60, 53);
        ctx.fillStyle = '#182432';
        ctx.fillRect(buildingX + 109, buildingY + 82, 43, 83);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(buildingX + 29, buildingY + 62, 52, 4);
        ctx.fillRect(buildingX + 179, buildingY + 62, 52, 4);
        ctx.globalAlpha = 1;
        if (status === 'construction') {
            ctx.strokeStyle = '#f2cd67';
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(buildingX - 28, buildingY + 23);
            ctx.lineTo(buildingX + 70, buildingY - 72);
            ctx.lineTo(buildingX + 200, buildingY - 72);
            ctx.stroke();
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(buildingX + 74, buildingY - 72);
            ctx.lineTo(buildingX + 74, buildingY + 5);
            ctx.moveTo(buildingX + 195, buildingY - 72);
            ctx.lineTo(buildingX + 195, buildingY + 5);
            ctx.stroke();
        }
        else if (status === 'active') {
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(buildingX + buildingW / 2, buildingY + 17, 19, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#152030';
            ctx.font = '700 20px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(jobId === 'minero' ? 'M' : jobId === 'lenador' ? 'A' : jobId === 'agricultor' ? 'F' : jobId === 'repartidor' ? 'R' : jobId === 'cocinero' ? 'C' : jobId === 'pescador' ? 'P' : jobId === 'ladron' ? 'L' : 'D', buildingX + buildingW / 2, buildingY + 24);
            ctx.fillStyle = accent;
            if (jobId === 'minero') {
                ctx.fillRect(buildingX + 17, buildingY + 119, 64, 7);
                ctx.fillRect(buildingX + 24, buildingY + 130, 54, 4);
                ctx.fillStyle = '#455a6c';
                ctx.beginPath();
                ctx.moveTo(buildingX + 31, buildingY + 141);
                ctx.lineTo(buildingX + 43, buildingY + 126);
                ctx.lineTo(buildingX + 58, buildingY + 141);
                ctx.closePath();
                ctx.fill();
            }
            else if (jobId === 'lenador') {
                ctx.fillRect(buildingX + 18, buildingY + 121, 70, 17);
                ctx.fillStyle = '#60472f';
                for (let i = 0; i < 3; i++)
                    ctx.fillRect(buildingX + 23 + i * 21, buildingY + 122, 4, 15);
            }
            else if (jobId === 'agricultor') {
                ctx.strokeStyle = '#8fd06b';
                ctx.lineWidth = 4;
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    ctx.moveTo(buildingX + 15 + i * 20, buildingY + 177);
                    ctx.lineTo(buildingX + 21 + i * 20, buildingY + 143);
                    ctx.stroke();
                }
                ctx.fillStyle = '#f3c96a';
                ctx.beginPath();
                ctx.arc(buildingX + 45, buildingY + 148, 7, 0, Math.PI * 2);
                ctx.fill();
            }
            else if (jobId === 'repartidor') {
                ctx.fillStyle = '#d7e7f5';
                ctx.fillRect(buildingX + 175, buildingY + 118, 56, 12);
                ctx.fillStyle = accent;
                ctx.fillRect(buildingX + 180, buildingY + 113, 14, 14);
                ctx.fillRect(buildingX + 199, buildingY + 113, 14, 14);
            }
            else if (jobId === 'cocinero') {
                for (let i = 0; i < 8; i++) {
                    ctx.fillStyle = i % 2 ? '#f5e6d2' : accent;
                    ctx.fillRect(buildingX + 20 + i * 29, buildingY + 43, 15, 17);
                }
                ctx.fillStyle = '#ffd98a';
                ctx.beginPath();
                ctx.arc(buildingX + 129, buildingY + 75, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            else if (jobId === 'pescador') {
                ctx.fillRect(buildingX - 26, buildingY + 157, buildingW + 52, 9);
                ctx.fillStyle = '#24475d';
                ctx.beginPath();
                ctx.moveTo(buildingX + 190, buildingY + 156);
                ctx.lineTo(buildingX + 244, buildingY + 156);
                ctx.lineTo(buildingX + 233, buildingY + 174);
                ctx.lineTo(buildingX + 200, buildingY + 174);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#e7d49a';
                ctx.fillRect(buildingX + 210, buildingY + 129, 3, 28);
                ctx.beginPath();
                ctx.moveTo(buildingX + 213, buildingY + 130);
                ctx.lineTo(buildingX + 231, buildingY + 148);
                ctx.lineTo(buildingX + 213, buildingY + 148);
                ctx.closePath();
                ctx.fill();
            }
            else if (jobId === 'ladron') {
                ctx.fillStyle = '#2b2037';
                ctx.fillRect(buildingX + 22, buildingY + 120, 68, 28);
                ctx.fillStyle = accent;
                ctx.beginPath();
                ctx.arc(buildingX + 56, buildingY + 132, 10, Math.PI, Math.PI * 2);
                ctx.lineTo(buildingX + 67, buildingY + 145);
                ctx.lineTo(buildingX + 45, buildingY + 145);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#2b2037';
                ctx.beginPath();
                ctx.arc(buildingX + 56, buildingY + 133, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(buildingX + 53, buildingY + 133, 6, 11);
                ctx.fillStyle = '#dfc9a0';
                ctx.fillRect(buildingX + 177, buildingY + 123, 53, 4);
                ctx.fillRect(buildingX + 181, buildingY + 133, 45, 4);
            }
            else if (jobId === 'detective') {
                ctx.fillStyle = '#203249';
                ctx.beginPath();
                ctx.moveTo(buildingX + 30, buildingY + 119);
                ctx.lineTo(buildingX + 56, buildingY + 125);
                ctx.lineTo(buildingX + 56, buildingY + 147);
                ctx.lineTo(buildingX + 43, buildingY + 157);
                ctx.lineTo(buildingX + 30, buildingY + 147);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = accent;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(buildingX + 202, buildingY + 133, 12, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(buildingX + 211, buildingY + 142);
                ctx.lineTo(buildingX + 225, buildingY + 155);
                ctx.stroke();
                ctx.fillStyle = accent;
                ctx.beginPath();
                ctx.arc(buildingX + 43, buildingY + 137, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.fillStyle = '#f7fafc';
        ctx.font = '700 18px Arial, sans-serif';
        ctx.textAlign = 'center';
        if (status === 'closed') {
            ctx.fillStyle = 'rgba(25,8,10,.55)';
            ctx.fillRect(buildingX - 18, buildingY - 42, buildingW + 36, buildingH + 83);
            ctx.strokeStyle = '#e27373';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(buildingX + 24, buildingY + 66);
            ctx.lineTo(buildingX + buildingW - 24, buildingY + 160);
            ctx.moveTo(buildingX + buildingW - 24, buildingY + 66);
            ctx.lineTo(buildingX + 24, buildingY + 160);
            ctx.stroke();
        }
        ctx.fillText(status === 'construction' ? 'OBRA EN MARCHA' : status === 'closed' ? 'CLAUSURADO' : `NIVEL ${level} · ${scene?.shape ?? 'NEGOCIO'}`, width / 2, 314);
    }
    for (let i = 0; i < 12; i++) {
        const x = 42 + i * 82;
        const h = 18 + ((i * 19) % 24);
        ctx.fillStyle = i % 2 ? 'rgba(240,247,255,.32)' : 'rgba(255,224,150,.3)';
        ctx.fillRect(x, 288 - h, 3, h);
        ctx.fillRect(x - 3, 288 - h - 4, 9, 3);
    }
    const overlay = ctx.createLinearGradient(0, 0, 0, 132);
    overlay.addColorStop(0, 'rgba(0,0,0,.58)');
    overlay.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, 132);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = '700 25px Arial, sans-serif';
    ctx.fillText(status === 'land' ? 'TU TERRENO' : status === 'construction' ? 'CONSTRUCCIÓN' : status === 'closed' ? 'NEGOCIO CLAUSURADO' : scene?.shape ?? 'NEGOCIO', 34, 48);
    ctx.font = '500 15px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.84)';
    ctx.fillText(status === 'land' ? 'Un espacio para empezar tu negocio' : status === 'construction' ? 'Preparando el lugar de trabajo' : status === 'closed' ? 'Paga la multa desde el panel para reabrir' : 'Negocio integrado a tu oficio', 35, 75);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(width - 52, 48, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#152030';
    ctx.font = '700 15px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦', width - 52, 54);
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.roundRect(width - 128, height - 42, 96, 25, 12);
    ctx.fill();
    ctx.fillStyle = '#f7fafc';
    ctx.font = '600 13px Arial, sans-serif';
    ctx.fillText(`${businessJobs.find((entry) => entry.jobId === jobId)?.icon ?? '🏡'} PROPIEDAD`, width - 80, height - 25);
    return canvas.toBuffer('image/png');
}
