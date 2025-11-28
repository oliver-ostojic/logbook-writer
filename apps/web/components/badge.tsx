type BadgeProps = {type BadgeProps = {type BadgeProps = {type BadgeProps = {

  color?: 'lime' | 'purple' | 'rose' | 'red' | 'gray' | 'zinc'

  children: React.ReactNode  color?: 'lime' | 'purple' | 'rose' | 'red' | 'gray'

  className?: string

}  children: React.ReactNode  color?: 'lime' | 'purple' | 'rose' | 'red' | 'gray'  color?: 'lime' | 'purple' | 'rose' | 'red' | 'gray'



const colorClasses = {  className?: string

  lime: 'bg-lime-50 text-lime-700 ring-lime-600/20',

  purple: 'bg-purple-50 text-purple-700 ring-purple-700/10',}  children: React.ReactNode  children: React.ReactNode

  rose: 'bg-rose-50 text-rose-700 ring-rose-600/10',

  red: 'bg-red-50 text-red-700 ring-red-600/10',

  gray: 'bg-gray-50 text-gray-600 ring-gray-500/10',

  zinc: 'bg-zinc-50 text-zinc-700 ring-zinc-600/10',const colorClasses = {  className?: string  className?: string

}

  lime: 'bg-lime-50 text-lime-700 ring-lime-600/20',

export function Badge({ color = 'zinc', children, className }: BadgeProps) {

  return (  purple: 'bg-purple-50 text-purple-700 ring-purple-700/10',}}

    <span

      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${colorClasses[color]} ${className || ''}`}  rose: 'bg-rose-50 text-rose-700 ring-rose-600/10',

    >

      {children}  red: 'bg-red-50 text-red-700 ring-red-600/10',

    </span>

  )  gray: 'bg-gray-50 text-gray-600 ring-gray-500/10',

}

}const colorClasses = {const colorClasses = {



export function Badge({ color = 'gray', children, className }: BadgeProps) {  lime: 'bg-lime-50 text-lime-700 ring-lime-600/20',  lime: 'bg-lime-50 text-lime-700 ring-lime-600/20',

  return (

    <span  purple: 'bg-purple-50 text-purple-700 ring-purple-700/10',  purple: 'bg-purple-50 text-purple-700 ring-purple-700/10',

      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${colorClasses[color]} ${className || ''}`}

    >  rose: 'bg-rose-50 text-rose-700 ring-rose-600/10',  rose: 'bg-rose-50 text-rose-700 ring-rose-600/10',

      {children}

    </span>  red: 'bg-red-50 text-red-700 ring-red-600/10',  red: 'bg-red-50 text-red-700 ring-red-600/10',

  )

}  gray: 'bg-gray-50 text-gray-600 ring-gray-500/10',  gray: 'bg-gray-50 text-gray-600 ring-gray-500/10',


}}



export function Badge({ color = 'gray', children, className }: BadgeProps) {export function Badge({ color = 'gray', children, className }: BadgeProps) {

  return (  return (

    <span    <span

      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${colorClasses[color]} ${className || ''}`}      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${colorClasses[color]} ${className || ''}`}

    >    >

      {children}      {children}

    </span>    </span>

  )  )

}}

