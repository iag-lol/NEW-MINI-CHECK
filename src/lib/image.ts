/**
 * Preparación de imágenes de perfil en el navegador.
 *
 * Las fotos salen de la cámara del teléfono con 3–12 MB y 4000 px de lado.
 * Para un avatar de 64 px eso es absurdo: se recorta al cuadrado central y se
 * reescala a 320 px, lo que deja un JPEG de ~20 KB. A ese tamaño la foto cabe
 * incluso dentro de una columna de texto, que es el plan B cuando el bucket
 * de Storage no acepta la subida.
 */

const LADO_MAX = 320
const CALIDAD = 0.82

export interface AvatarPreparado {
  /** JPEG listo para subir a Storage */
  blob: Blob
  /** El mismo JPEG como data URI, para guardar directo en la base de datos */
  dataUrl: string
  bytes: number
}

const leerComoImagen = (archivo: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo)
    const imagen = new Image()
    imagen.onload = () => {
      URL.revokeObjectURL(url)
      resolve(imagen)
    }
    imagen.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No pudimos leer la imagen seleccionada'))
    }
    imagen.src = url
  })

export const prepararAvatar = async (archivo: File): Promise<AvatarPreparado> => {
  const imagen = await leerComoImagen(archivo)

  // Recorte cuadrado centrado: evita avatares deformados
  const lado = Math.min(imagen.naturalWidth, imagen.naturalHeight)
  const origenX = (imagen.naturalWidth - lado) / 2
  const origenY = (imagen.naturalHeight - lado) / 2
  const destino = Math.min(LADO_MAX, lado)

  const lienzo = document.createElement('canvas')
  lienzo.width = destino
  lienzo.height = destino

  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error('El navegador no permite procesar la imagen')

  // Fondo blanco: los PNG con transparencia quedarían negros al pasar a JPEG
  contexto.fillStyle = '#ffffff'
  contexto.fillRect(0, 0, destino, destino)
  contexto.imageSmoothingQuality = 'high'
  contexto.drawImage(imagen, origenX, origenY, lado, lado, 0, 0, destino, destino)

  const dataUrl = lienzo.toDataURL('image/jpeg', CALIDAD)

  const blob = await new Promise<Blob>((resolve, reject) => {
    lienzo.toBlob(
      (resultado) =>
        resultado
          ? resolve(resultado)
          : reject(new Error('No pudimos comprimir la imagen')),
      'image/jpeg',
      CALIDAD
    )
  })

  return { blob, dataUrl, bytes: blob.size }
}
